import io
import os
from datetime import datetime
import anthropic
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table,
    TableStyle, PageBreak, HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER

BIRK_DARK   = HexColor('#1A2744')
BIRK_BLUE   = HexColor('#243560')
BIRK_ACCENT = HexColor('#2E5FA3')
BIRK_GREEN  = HexColor('#27AE60')
BIRK_RED    = HexColor('#E74C3C')
BIRK_LIGHT  = HexColor('#F4F6FA')
BIRK_GREY   = HexColor('#6C757D')


def get_claude_narrative(exp: dict, policy_name: str, rec: dict) -> str:
    try:
        pnl = exp.get('pnl', 0) or 0
        pnl_str = f"+${abs(pnl):,.0f}" if pnl >= 0 else f"-${abs(pnl):,.0f}"
        current_hedge_pct = (exp.get('hedge_ratio_policy', 0) or 0) * 100
        target_pct = (rec.get('target_hedge_ratio', 0) or 0) * 100

        prompt = (
            f"You are a senior FX risk analyst writing for a CFO audience.\n\n"
            f"Exposure: {exp['from_currency']}/{exp['to_currency']}\n"
            f"Amount: {exp['from_currency']} {exp.get('amount', 0):,.0f}\n"
            f"Budget rate: {exp.get('budget_rate', 0):.4f}\n"
            f"Current market rate: {exp.get('current_rate', 0):.4f}\n"
            f"Current P&L: {pnl_str}\n"
            f"Current hedge coverage: {current_hedge_pct:.0f}%\n"
            f"Target hedge coverage: {target_pct:.0f}% (under {policy_name} policy)\n"
            f"Recommended instrument: {rec.get('instrument', '3-month forward')}\n\n"
            f"Write exactly 3 sentences for a CFO explaining:\n"
            f"1. Why this exposure needs attention now\n"
            f"2. What the financial risk is if no action is taken (quantify it)\n"
            f"3. Why the recommended instrument is appropriate\n\n"
            f"CRITICAL: Do not use any markdown formatting. No asterisks, no hash symbols, "
            f"no bold, no headers. Plain sentences only. Professional tone."
        )

        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text.strip()

    except Exception:
        pnl = exp.get('pnl', 0) or 0
        action = "lock in current gains" if pnl >= 0 else "limit further downside"
        return (
            f"This {exp.get('from_currency','')}/{exp.get('to_currency','')} exposure requires "
            f"attention under your current {policy_name} policy. "
            f"A {rec.get('instrument', 'forward contract')} is recommended to {action} "
            f"and align hedge coverage with your policy targets."
        )


def get_portfolio_narrative(summary: dict, policy_name: str, breach_count: int) -> str:
    try:
        pnl = summary['total_pnl']
        pnl_str = f"+${abs(pnl):,.0f}" if pnl >= 0 else f"-${abs(pnl):,.0f}"

        prompt = (
            f"You are a senior FX risk analyst writing an executive summary for a CFO.\n\n"
            f"Portfolio overview:\n"
            f"- Total FX exposures: {summary['total_exposures']}\n"
            f"- Total exposure value: ${summary['total_exposure_usd']:,.0f}\n"
            f"- Total P&L: {pnl_str}\n"
            f"- Active policy: {policy_name}\n"
            f"- Exposures in breach: {breach_count}\n"
            f"- Average hedge coverage: {summary['avg_hedge_ratio']:.0f}%\n\n"
            f"Write exactly 3 sentences covering overall portfolio health, "
            f"the key risk concern, and the recommended priority action. "
            f"Quantify risks where possible.\n\n"
            f"CRITICAL: Do not use any markdown formatting. No asterisks, no hash symbols, "
            f"no bold, no headers. Plain sentences only."
        )

        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text.strip()

    except Exception:
        pnl = summary['total_pnl']
        pnl_str = f"+${abs(pnl):,.0f}" if pnl >= 0 else f"-${abs(pnl):,.0f}"
        return (
            f"Your FX portfolio comprises {summary['total_exposures']} active exposures "
            f"with a total value of ${summary['total_exposure_usd']:,.0f}. "
            f"The portfolio shows a total P&L of {pnl_str} under your {policy_name} policy. "
            f"Priority attention is required for the {breach_count} exposure(s) currently in breach."
        )


def generate_currency_plan_pdf(
    exposures: list,
    recommendations: list,
    active_policy: dict,
    company_name: str = "BIRK Commodities A/S"
) -> bytes:

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm
    )

    styles = getSampleStyleSheet()

    def style(name, **kwargs):
        return ParagraphStyle(name, parent=styles['Normal'], **kwargs)

    heading1   = style('H1', fontSize=15, textColor=BIRK_DARK,
                       fontName='Helvetica-Bold', spaceAfter=6, spaceBefore=12)
    heading2   = style('H2', fontSize=10, textColor=BIRK_BLUE,
                       fontName='Helvetica-Bold', spaceAfter=4, spaceBefore=8)
    body       = style('Body', fontSize=9, textColor=HexColor('#333333'),
                       fontName='Helvetica', spaceAfter=4, leading=14)
    caption    = style('Caption', fontSize=7, textColor=BIRK_GREY,
                       fontName='Helvetica', spaceAfter=2)
    white_bold = style('WB', fontSize=20, textColor=white,
                       fontName='Helvetica-Bold', alignment=TA_CENTER)
    white_sub  = style('WSub', fontSize=9, textColor=HexColor('#B8C5D6'),
                       fontName='Helvetica', alignment=TA_CENTER)
    grey_sm    = style('GSM', fontSize=9, textColor=BIRK_GREY, fontName='Helvetica')
    grey_right = style('GR', fontSize=9, textColor=BIRK_GREY,
                       fontName='Helvetica', alignment=TA_RIGHT)
    red_bold   = style('RB', fontSize=9, textColor=BIRK_RED,
                       fontName='Helvetica-Bold', alignment=TA_RIGHT)

    policy_name = (active_policy or {}).get('name', 'Balanced')
    today = datetime.now().strftime("%d %B %Y")
    story = []

    # ── COVER (compact — fits on same page as exec summary) ──────────────────
    cover = Table(
        [[Paragraph("AUTOMATED CURRENCY PLAN", white_bold)],
         [Spacer(1, 3 * mm)],
         [Paragraph(f"Active Policy: {policy_name}  |  {company_name}  |  {today}", white_sub)]],
        colWidths=[174 * mm]
    )
    cover.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, -1), BIRK_DARK),
        ('TOPPADDING',    (0, 0), (-1, -1), 10 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10 * mm),
        ('LEFTPADDING',   (0, 0), (-1, -1), 8 * mm),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 8 * mm),
    ]))
    story.append(cover)
    story.append(Spacer(1, 4 * mm))

    info = Table(
        [[Paragraph(company_name, style('CN', fontSize=12, textColor=BIRK_DARK,
                                        fontName='Helvetica-Bold')),
          Paragraph(today, grey_right)],
         [Paragraph("CONFIDENTIAL", red_bold),
          Paragraph("Generated by BIRK FX Advisory Engine", grey_right)]],
        colWidths=[100 * mm, 74 * mm]
    )
    info.setStyle(TableStyle([
        ('TOPPADDING',    (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    story.append(info)
    story.append(HRFlowable(width="100%", thickness=1,
                             color=BIRK_ACCENT, spaceAfter=5 * mm))

    # ── CALCULATE SUMMARY ────────────────────────────────────────────────────
    total_pnl = 0.0
    total_exp_usd = 0.0
    breach_count = 0
    hedge_ratios = []

    for exp in exposures:
        amt = exp.get('amount', 0) or 0
        br  = exp.get('budget_rate', 1) or 1
        cr  = exp.get('current_rate', 1) or 1
        hr  = exp.get('hedge_ratio_policy', 0) or 0
        pnl = (cr - br) * amt
        exp['pnl'] = pnl
        total_pnl     += pnl
        total_exp_usd += amt * cr
        hedge_ratios.append(float(hr) * 100)
        if pnl < -50000:
            breach_count += 1

    avg_hr = sum(hedge_ratios) / len(hedge_ratios) if hedge_ratios else 0
    summary = {
        'total_exposures':    len(exposures),
        'total_exposure_usd': total_exp_usd,
        'total_pnl':          total_pnl,
        'avg_hedge_ratio':    avg_hr,
    }

    # ── EXECUTIVE SUMMARY ────────────────────────────────────────────────────
    story.append(Paragraph("Executive Summary", heading1))

    pnl_disp = (f"+${total_pnl:,.0f}" if total_pnl >= 0
                else f"-${abs(total_pnl):,.0f}")

    metrics = [
        ['METRIC', 'VALUE'],
        ['Total Active Exposures',  str(len(exposures))],
        ['Total Exposure Value',    f"${total_exp_usd:,.0f}"],
        ['Portfolio P&L',           pnl_disp],
        ['Average Hedge Coverage',  f"{avg_hr:.0f}%"],
        ['Active Policy',           policy_name],
        ['Exposures in Breach',     str(breach_count)],
    ]
    mt = Table(metrics, colWidths=[95 * mm, 79 * mm])
    mt.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, 0), BIRK_BLUE),
        ('TEXTCOLOR',     (0, 0), (-1, 0), white),
        ('FONTNAME',      (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE',      (0, 0), (-1, -1), 9),
        ('FONTNAME',      (0, 1), (-1, -1), 'Helvetica'),
        ('ROWBACKGROUNDS',(0, 1), (-1, -1), [BIRK_LIGHT, white]),
        ('GRID',          (0, 0), (-1, -1), 0.5, HexColor('#DEE2E6')),
        ('TOPPADDING',    (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING',   (0, 0), (-1, -1), 8),
    ]))
    story.append(mt)
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph("Portfolio Risk Assessment", heading2))
    story.append(Paragraph(
        get_portfolio_narrative(summary, policy_name, breach_count), body))

    # ── PER-EXPOSURE RECOMMENDATIONS ─────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("Exposure Recommendations", heading1))
    story.append(Paragraph(
        f"Recommendations generated under your {policy_name} policy "
        f"using current market rates as of {today}.",
        body
    ))
    story.append(Spacer(1, 3 * mm))

    rec_lookup = {r.get('exposure_id'): r for r in recommendations}

    for i, exp in enumerate(exposures):
        pair       = f"{exp.get('from_currency','')}/{exp.get('to_currency','')}"
        amt        = exp.get('amount', 0) or 0
        br         = exp.get('budget_rate', 0) or 0
        cr         = exp.get('current_rate', 0) or 0
        pnl        = exp.get('pnl', 0) or 0
        hr_pct     = float(exp.get('hedge_ratio_policy', 0) or 0) * 100
        rec        = rec_lookup.get(exp.get('id'), {})
        target     = float(rec.get('target_hedge_ratio', 0) or 0) * 100
        instrument = rec.get('instrument', '3-month forward')
        action     = rec.get('action', 'REVIEW')
        pnl_disp   = f"+${pnl:,.0f}" if pnl >= 0 else f"-${abs(pnl):,.0f}"

        hdr = Table(
            [[Paragraph(f"{i+1}.  {pair}", style('EH', fontSize=11,
                        textColor=white, fontName='Helvetica-Bold')),
              Paragraph(action, style('EA', fontSize=9, textColor=white,
                        fontName='Helvetica-Bold', alignment=TA_RIGHT))]],
            colWidths=[124 * mm, 50 * mm]
        )
        hdr.setStyle(TableStyle([
            ('BACKGROUND',    (0, 0), (-1, -1), BIRK_BLUE),
            ('TOPPADDING',    (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING',   (0, 0), (-1, -1), 8),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 8),
        ]))
        story.append(hdr)

        end_date = str(exp.get('end_date', 'TBC') or 'TBC')
        details = [
            ['Amount',        f"{exp.get('from_currency','')} {amt:,.0f}",
             'Budget Rate',   f"{br:.4f}"],
            ['Current Rate',  f"{cr:.4f}",
             'P&L',           pnl_disp],
            ['Current Hedge', f"{hr_pct:.0f}%",
             'Target Hedge',  f"{target:.0f}%"],
            ['Instrument',    instrument,
             'Maturity',      end_date],
        ]
        dt = Table(details, colWidths=[36 * mm, 51 * mm, 36 * mm, 51 * mm])
        dt.setStyle(TableStyle([
            ('FONTNAME',      (0, 0), (-1, -1), 'Helvetica'),
            ('FONTNAME',      (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME',      (2, 0), (2, -1), 'Helvetica-Bold'),
            ('FONTSIZE',      (0, 0), (-1, -1), 8),
            ('ROWBACKGROUNDS',(0, 0), (-1, -1), [BIRK_LIGHT, white]),
            ('GRID',          (0, 0), (-1, -1), 0.5, HexColor('#DEE2E6')),
            ('TOPPADDING',    (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING',   (0, 0), (-1, -1), 6),
        ]))
        story.append(dt)

        story.append(Paragraph("AI Analysis", style('AIH', fontSize=9,
            textColor=BIRK_ACCENT, fontName='Helvetica-Bold',
            spaceBefore=4, spaceAfter=2)))
        story.append(Paragraph(get_claude_narrative(exp, policy_name, rec), body))
        story.append(Spacer(1, 5 * mm))

    # ── DISCLAIMER ───────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(HRFlowable(width="100%", thickness=1, color=BIRK_ACCENT,
                             spaceBefore=4 * mm, spaceAfter=4 * mm))
    disc = Table(
        [[Paragraph("Generated by BIRK FX Advisory Engine", grey_sm),
          Paragraph(f"Confidential  |  {today}", grey_right)]],
        colWidths=[87 * mm, 87 * mm]
    )
    story.append(disc)
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        "This report is generated by the BIRK FX Advisory Engine for informational "
        "purposes only. It does not constitute financial advice or a recommendation "
        "to execute any specific transaction. All hedging decisions should be made "
        "in consultation with your treasury team and banking partners. "
        "Rates shown are indicative only.",
        caption
    ))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()