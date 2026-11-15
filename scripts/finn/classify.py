"""Rule-based filing classifier: category (from the reference doc) + tier (Act / Note / Routine) + the rule that fired.

Rules are ordered; the first match wins. Each rule is (name, category, tier, pattern, [anti-pattern]).
Patterns run on lower-cased "subcategory | title | headline" (and, for generic filings, the PDF's first page).
"""
import re

ACT, NOTE, ROUTINE = "Act", "Note", "Routine"

# Order matters: noise first (so "newspaper ad about results" is not a results card), then material events.
RULES = [
    # --- routine paperwork
    ("newspaper", "unclassified", ROUTINE, r"newspaper|news paper|clipping|publication of notice"),
    ("call_recording", "earnings_call", ROUTINE, r"audio|video recording|webcast|recording of (the )?(earnings|investor|conference)"),
    ("call_schedule", "earnings_call", ROUTINE, r"schedule of .*(call|conference)|intimation of .*(earnings|conference) call|earnings call.*intimation"),
    ("trading_window", "insider_trading", ROUTINE, r"trading window|trading plan"),
    ("compliance_cert", "unclassified", ROUTINE,
     r"reg\.? ?74 ?\(5\)|74\(5\)|secretarial compliance|24\(a\)|brsr|business responsibility|esg (rating|overview|report)|"
     r"sustainability report|compliance certificate|certificate under|investor education|iepf|special window|"
     r"loss of share certificate|duplicate share|transfer and demat|registrar and (share )?transfer|\brta\b"),
    ("insider_code", "insider_trading", ROUTINE, r"code of (practices|conduct|fair disclosure)|fair disclosure of unpublished|regulation 8\(2\)"),
    ("shareholder_letter", "unclassified", ROUTINE, r"letter to (the )?shareholders.{0,120}(e-?mail|link)|whose e-?mail address"),
    ("esop", "unclassified", ROUTINE, r"esop|esps|stock option|restricted stock unit|\brsus?\b|employee stock|allotment of esop"),
    ("investor_meet", "investor_meetings", ROUTINE,
     r"analyst|investor meet|investors'* meet|institutional investor|investor conference|meeting updates|"
     r"investor\(s\) meet|analyst\(s\)"),

    ("voting_results", "postal_ballot", ROUTINE, r"postal.?ballot|scrutini[sz]er|voting results?|e-?voting"),
    ("sast_pledge", "pledging", NOTE, r"31\(1\)|31\(2\)|encumbrance"),
    ("sast_insider", "insider_trading", NOTE, r"\bsast\b|29\(1\)|29\(2\)|substantial acquisition|pit\)? regulations|7\(2\)"),
    ("exchange_query", "press_release", NOTE, r"clarification|rumou?r|news verification"),

    # --- results family
    # Another company's results (e.g. Maruti filing "results issued by Suzuki Motor Corporation", its parent) are not ours.
    ("other_company_results", "press_release", NOTE,
     r"(results?|financials?) (issued|declared|announced|published|reported) by|reference to the (consolidated |standalone )?financial results"),
    ("transcript_first", "earnings_call", NOTE, r"transcript"),
    ("results_intimation", "results", ROUTINE, r"board meeting intimation|intimation of board meeting|prior intimation"),
    ("results_presentation", "results", NOTE, r"investor presentation|results presentation|earnings presentation"),
    ("results", "results", ACT,
     r"financial results?|\bresults? for the (quarter|half|year|period)|un-?audited.*results|audited.*results|"
     r"outcome.*results|result$|\bq[1-4] ?fy ?\d{2,4} results"),
    ("transcript", "earnings_call", NOTE, r"transcript"),

    # --- management change
    ("auditor_resign", "management_change", ACT, r"resignation of (the )?(statutory )?auditor"),
    ("auditor_routine", "unclassified", ROUTINE, r"appointment of (the )?(statutory |secretarial |internal |cost )?auditor"),
    ("mgmt_reappoint", "management_change", NOTE, r"re-?appointment|continuation|extension of (the )?tenure"),
    ("mgmt_rbi_approval", "management_change", NOTE, r"approval.*reserve bank.*appoint|reserve bank.*approv.*appoint"),
    ("mgmt_top", "management_change", ACT,
     r"(appoint|resign|cessation|ceas|retire|step(s|ped)? down|demise|vacat|elevat|redesignat|change in (management|directorate)|"
     r"resignation of (director|chief))"
     r"[^|]{0,200}?(chief executive|\bceo\b|chief financial|\bcfo\b|managing director|\bmd\b|chairman|chairperson|"
     r"whole[- ]time director|executive director|chief operating|\bcoo\b)"
     r"|(chief executive|\bceo\b|chief financial|\bcfo\b|managing director|chairman|whole[- ]time director)"
     r"[^|]{0,120}?(appoint|resign|cessation|retire|step(s|ped)? down)"),
    ("mgmt_other", "management_change", NOTE,
     r"change in (management|directorate)|resignation of (director|chief|cfo|company secretary)|"
     r"(appoint|resign|cessation)[^|]{0,120}?(director|company secretary|compliance officer|key managerial|\bkmp\b|"
     r"senior management|chief|officer)"),

    # --- corporate events
    # Regulator: adverse findings are Act; product approvals and closed inspections are good news (Note).
    ("regulator_adverse", "litigation", ACT, r"warning letter|import alert|form 483|483 observations|\boai\b|official action indicated|untitled letter"),
    ("regulator_approval", "press_release", NOTE, r"usfda|u\.s\. fda|\bfda\b|establishment inspection|\beir\b|tentative approval|\banda\b"),
    ("mna_cleanup_early", "unclassified", ROUTINE, r"strike off|struck off|dissolution|liquidation of .*subsidiary|voluntary winding"),
    # Money moving between group companies (subsidiary investments, subscriptions, subsidiary buybacks) is not a deal.
    ("intra_group", "M&A", NOTE,
     r"subsidiary.{0,250}(buy-?back|investment|subscri|allot|at+ot+ed|al+ot+ed|infus|preference shares|rights issue)|"
     r"(buy-?back|investment in|subscri\w* to|allot\w*|infus\w*).{0,600}subsidiary|"
     r"(merger|amalgamation) of .{0,160}(wholly[- ]owned )?subsidiar|subsidiar.{0,160}(merger|amalgamation) (into|with)"),  # at+ot+ed: OCR reads "allotted" as "attotted"
    ("litigation", "litigation", ACT,
     r"penalt|\bfine[ds]?\b|show cause|\bnclt\b|tribunal|high court|supreme court|litigation|antitrust|"
     r"tax demand|demand notice|\bgst\b.*(order|demand)|income tax.*(order|search)|search and seizure|enforcement directorate|"
     r"sebi (order|adjudicat)|insolvency|\bcirp\b|legal review|internal review|fraud|forensic",
     r"observation letter"),
    ("subsidiary_ipo_prep", "M&A", NOTE, r"proposed initial public offer|draft red herring|observation letter|red herring", r"post-ipo"),
    # "(Post-IPO)" in Reliance's AGM papers is not an IPO
    ("subsidiary_ipo", "M&A", ACT, r"initial public offer|\bipo\b|listing of equity shares|issue price", r"post-ipo|annual general meeting|chairman.s statement"),
    ("mna_update", "M&A", NOTE, r"updates? on acquisition|completion of acquisition|incorporation of (a |wholly )?.*subsidiary|subsidiary.{0,120}(has been|was) incorporated"),
    ("mna_cleanup", "unclassified", ROUTINE, r"strike off|struck off|dissolution|liquidation of .*subsidiary"),
    ("mna", "M&A", ACT,
     r"acquisition|acquire|amalgamation|merger|demerger|joint venture|scheme of arrangement|stake (sale|purchase)|"
     r"divest|restructuring|slump sale|business transfer"),
    ("fund_raise_equity", "fund_raise", ACT,
     r"\bqip\b|qualified institution|rights issue|preferential (issue|allotment)|buy-?back|warrants|fund rais"),
    ("fund_raise_debt", "fund_raise", NOTE,
     r"debenture|\bncds?\b|commercial paper|bonds?\b|tier 1|tier i\b|call option|issue of securities|senior unsecured"),
    ("rating_down", "credit_rating", ACT, r"(credit )?rating.*(downgrad|negative|watch)|downgrad.*rating"),
    ("rating_up", "credit_rating", NOTE, r"(credit )?rating.*(upgrad|positive)|upgrad.*rating"),
    ("rating_other", "credit_rating", ROUTINE, r"credit rating|rating"),
    ("pledge_create", "pledging", ACT, r"(creation|invocation) of (pledge|encumbrance)|pledge (created|invoked)"),
    ("pledge", "pledging", NOTE, r"pledge"),
    ("insider", "insider_trading", NOTE, r"insider"),
    ("bonus_split", "bonus_split", NOTE, r"\bbonus\b|stock split|sub-?division|split of"),
    ("dividend_declared", "dividend", NOTE, r"declar\w* (of )?(an )?(interim |final |special )?dividend|approv\w* (the )?(payment of )?(an )?(interim |final )?dividend"),
    ("dividend_pay", "dividend", ROUTINE, r"date of payment|payment of dividend|dividend updates|tds on dividend"),
    ("dividend", "dividend", NOTE, r"dividend"),
    ("record_date", "dividend", ROUTINE, r"record date|book closure"),
    ("capex", "capex", NOTE,
     r"capacity expansion|new plant|greenfield|brownfield|commission(ed|ing)|commercial production|capex|"
     r"capital expenditure|manufacturing facility|data cent(er|re)"),
    ("order_win", "press_release", NOTE,
     r"order (win|inflow|received|book|of rs|worth|from|valued)|receipt of (an )?order|award of order|\bbags?\b|"
     r"\bwins?\b|awarded|letter of (award|intent)|\bdeal\b|contract (win|worth|of|from|valued)|selects|signs"),
    ("statement", "press_release", NOTE, r"media statement|statement of the company|company.s statement"),
    ("annual_report", "unclassified", NOTE, r"annual report"),
    ("egm", "agm_egm", NOTE, r"\begm\b|extra-?ordinary general"),
    ("postal_ballot", "postal_ballot", ROUTINE, r"postal ballot|scrutini[sz]er|e-?voting|voting results"),
    ("agm", "agm_egm", ROUTINE, r"\bagm\b|annual general meeting|general meeting"),
    ("board_outcome", "unclassified", ROUTINE, r"board meeting|outcome of board"),
    ("press_release", "press_release", ROUTINE, r"press release|media release|press note"),
]
_COMPILED = [(n, c, t, re.compile(p), re.compile(a[0]) if a else None) for n, c, t, p, *a in RULES]

_BOILER = re.compile(
    r"announcements?|disclosures?|intimations?|under|regulation|regulations|reg\.?|\b30\b|\(lodr\)|lodr|sebi|of|the|and|"
    r"securities|exchange|board|india|listing|obligations|disclosure|requirements|2015|other|applicable|read|with|"
    r"schedule|iii|para|part|clause|pursuant|to|is|are|attached|enclosed|please|find|herewith|as|general|others|"
    r"submission|update|updates|company|ltd|limited|\d+|[^a-z]")


def _informative(s):
    words = [w for w in re.split(r"[\s\-:,()]+", (s or "").lower()) if w and not _BOILER.fullmatch(w)]
    return len(words) >= 2


def match(text):
    t = re.sub(r"\s+", " ", (text or "").lower())  # PDF line breaks must not split a phrase the rules look for
    for name, cat, tier, rx, anti in _COMPILED:
        if rx.search(t) and not (anti and anti.search(t)):
            return {"category": cat, "tier": tier, "rule": name}
    return None


def is_generic(f):
    """Title and headline say nothing beyond 'disclosure under Reg 30'."""
    return not (_informative(f.get("title")) or _informative(f.get("headline")))


def classify(f, first_page=None):
    """Return {category, tier, rule, basis}. Generic filings fall back to BSE's subcategory, then the PDF's first page."""
    sub = f.get("subcategory") or ""
    base = f"{sub} | {f.get('title') or ''} | {f.get('headline') or ''}"
    if not is_generic(f):
        m = match(base)
        if m:
            return {**m, "basis": "title"}
    if sub and sub.lower() not in ("general", "others"):
        m = match(sub)
        if m:
            return {**m, "basis": "subcategory"}
    if first_page:
        m = match(first_page[:2500])
        if m:
            return {**m, "basis": "pdf"}
    return {"category": "unclassified", "tier": ROUTINE, "rule": "no_material_keyword", "basis": "none"}
