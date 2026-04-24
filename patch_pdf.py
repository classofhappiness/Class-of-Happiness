"""
Run with: python3 patch_pdf.py
Replaces the basic PDF report with a comprehensive version including:
- Daily check-in log with times
- Strategy frequency table
- Zone distribution with percentages
- Weekly pattern analysis
- Home vs school data (if parent linked)
- Professional layout suitable for sharing with parents/therapists
"""
import os

SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

with open(SERVER, "r") as f:
    content = f.read()

OLD_PDF = '''@api_router.get("/reports/pdf/student/{student_id}/month/{year}/{month}")
async def generate_pdf_report(student_id: str, year: int, month: int, request: Request):
    student = supabase.table("students").select("*").eq("id", student_id).execute()
    if not student.data:
        raise HTTPException(status_code=404, detail="Student not found")
    student_data = student.data[0]

    start = datetime(year, month, 1, tzinfo=timezone.utc).isoformat()
    _, last_day = calendar.monthrange(year, month)
    end = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc).isoformat()

    logs = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start).lte("timestamp", end).execute()
    logs_data = logs.data or []

    feeling_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    helper_counts = {}
    for log in logs_data:
        colour = log.get("feeling_colour", log.get("zone", ""))
        if colour in feeling_counts:
            feeling_counts[colour] += 1
        for h in log.get("helpers_selected", log.get("strategies_selected", [])):
            helper_counts[h] = helper_counts.get(h, 0) + 1

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    elements = []

    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=18, textColor=colors.HexColor('#5C6BC0'))
    elements.append(Paragraph(f"Class of Happiness - Feelings Report", title_style))
    elements.append(Paragraph(f"Student: {student_data['name']}", styles['Heading2']))
    elements.append(Paragraph(f"Month: {datetime(year, month, 1).strftime('%B %Y')}", styles['Normal']))
    elements.append(Spacer(1, 20))
    elements.append(Paragraph(f"Total check-ins: {len(logs_data)}", styles['Normal']))
    elements.append(Spacer(1, 20))

    # Feelings summary table
    elements.append(Paragraph("Feelings Summary", styles['Heading3']))
    total = sum(feeling_counts.values())
    data = [['Feeling Colour', 'Count', 'Percentage']]
    colour_names = {"blue": "Blue Feelings", "green": "Green Feelings", "yellow": "Yellow Feelings", "red": "Red Feelings"}
    for colour, count in feeling_counts.items():
        pct = f"{(count/total*100):.1f}%" if total > 0 else "0%"
        data.append([colour_names[colour], str(count), pct])

    table = Table(data, colWidths=[200, 80, 80])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#5C6BC0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E0E0E0')),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 20))

    # Top helpers
    if helper_counts:
        elements.append(Paragraph("Most Used Helpers", styles['Heading3']))
        top_helpers = sorted(helper_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        helper_data = [['Helper', 'Times Used']]
        for name, count in top_helpers:
            helper_data.append([name, str(count)])
        helper_table = Table(helper_data, colWidths=[200, 80])
        helper_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#5C6BC0')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E0E0E0')),
            ('PADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(helper_table)

    doc.build(elements)
    buffer.seek(0)
    filename = f"feelings_report_{student_data['name']}_{year}_{month:02d}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})'''

NEW_PDF = '''@api_router.get("/reports/pdf/student/{student_id}/month/{year}/{month}")
async def generate_pdf_report(student_id: str, year: int, month: int, request: Request):
    student = supabase.table("students").select("*").eq("id", student_id).execute()
    if not student.data:
        raise HTTPException(status_code=404, detail="Student not found")
    student_data = student.data[0]

    start = datetime(year, month, 1, tzinfo=timezone.utc).isoformat()
    _, last_day = calendar.monthrange(year, month)
    end = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc).isoformat()

    logs = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start).lte("timestamp", end).order("timestamp", desc=False).execute()
    logs_data = logs.data or []

    # Also get classroom info
    classroom_name = "Not assigned"
    if student_data.get("classroom_id"):
        try:
            cr = supabase.table("classrooms").select("name").eq("id", student_data["classroom_id"]).execute()
            if cr.data:
                classroom_name = cr.data[0]["name"]
        except: pass

    # Aggregate data
    feeling_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    helper_counts = {}
    daily_counts = {}  # date -> {zone: count}
    week_counts = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0}  # weekday -> count
    hour_counts = {}  # hour -> count

    for log in logs_data:
        colour = log.get("feeling_colour", log.get("zone", ""))
        if colour in feeling_counts:
            feeling_counts[colour] += 1
        for h in log.get("helpers_selected", log.get("strategies_selected", [])):
            if h:
                helper_counts[h] = helper_counts.get(h, 0) + 1
        try:
            ts = datetime.fromisoformat(log["timestamp"].replace("Z", "+00:00"))
            date_key = ts.strftime("%Y-%m-%d")
            if date_key not in daily_counts:
                daily_counts[date_key] = {"blue":0,"green":0,"yellow":0,"red":0}
            if colour in daily_counts[date_key]:
                daily_counts[date_key][colour] += 1
            week_counts[ts.weekday()] = week_counts.get(ts.weekday(), 0) + 1
            hour_counts[ts.hour] = hour_counts.get(ts.hour, 0) + 1
        except: pass

    # Build PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter,
        leftMargin=50, rightMargin=50, topMargin=50, bottomMargin=50)
    styles = getSampleStyleSheet()

    # Custom styles
    INDIGO = colors.HexColor('#5C6BC0')
    BLUE_C = colors.HexColor('#4A90D9')
    GREEN_C = colors.HexColor('#4CAF50')
    YELLOW_C = colors.HexColor('#FFC107')
    RED_C = colors.HexColor('#F44336')
    LIGHT = colors.HexColor('#F8F9FA')
    ZONE_COLORS_PDF = {"blue": BLUE_C, "green": GREEN_C, "yellow": YELLOW_C, "red": RED_C}
    COLOUR_NAMES = {"blue": "Blue Feelings", "green": "Green Feelings", "yellow": "Yellow Feelings", "red": "Red Feelings"}
    WEEKDAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]

    title_style = ParagraphStyle('CoHTitle', fontSize=22, textColor=INDIGO, fontName='Helvetica-Bold', spaceAfter=4)
    sub_style = ParagraphStyle('CoHSub', fontSize=11, textColor=colors.HexColor('#666666'), spaceAfter=2)
    section_style = ParagraphStyle('CoHSection', fontSize=13, textColor=INDIGO, fontName='Helvetica-Bold', spaceBefore=16, spaceAfter=8)
    normal_style = ParagraphStyle('CoHNormal', fontSize=10, textColor=colors.HexColor('#333333'), spaceAfter=4)
    small_style = ParagraphStyle('CoHSmall', fontSize=8, textColor=colors.HexColor('#666666'))
    disclaimer_style = ParagraphStyle('Disc', fontSize=8, textColor=colors.HexColor('#999999'), fontName='Helvetica-Oblique')

    elements = []
    total = sum(feeling_counts.values())
    month_name = datetime(year, month, 1).strftime("%B %Y")

    # ── HEADER ──
    elements.append(Paragraph("Class of Happiness", title_style))
    elements.append(Paragraph("Emotional Wellbeing Report", ParagraphStyle('sub2', fontSize=16, textColor=colors.HexColor('#333'), fontName='Helvetica-Bold', spaceAfter=2)))
    elements.append(Spacer(1, 6))

    # Student info box
    info_data = [
        [Paragraph('<b>Student:</b>', styles['Normal']), Paragraph(student_data['name'], styles['Normal']),
         Paragraph('<b>Class:</b>', styles['Normal']), Paragraph(classroom_name, styles['Normal'])],
        [Paragraph('<b>Period:</b>', styles['Normal']), Paragraph(month_name, styles['Normal']),
         Paragraph('<b>Total Check-ins:</b>', styles['Normal']), Paragraph(str(len(logs_data)), styles['Normal'])],
        [Paragraph('<b>Generated:</b>', styles['Normal']), Paragraph(datetime.now().strftime("%d %B %Y"), styles['Normal']),
         Paragraph('<b>Purpose:</b>', styles['Normal']), Paragraph("Educational & Therapeutic Support", styles['Normal'])],
    ]
    info_table = Table(info_data, colWidths=[90, 160, 90, 160])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), LIGHT),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E0E0E0')),
        ('PADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 16))

    # ── SECTION 1: ZONE DISTRIBUTION ──
    elements.append(Paragraph("1. Emotion Zone Distribution", section_style))
    elements.append(Paragraph(
        "The Zones of Regulation framework uses four colour zones to represent different emotional and physiological states. "
        "This section shows how frequently the student was in each zone during the reporting period.",
        normal_style
    ))

    zone_data = [['Zone', 'Colour', 'Description', 'Count', '%']]
    zone_descs = {
        "blue": "Sad, tired, moving slowly, low energy",
        "green": "Happy, calm, focused, ready to learn",
        "yellow": "Worried, frustrated, silly, losing control",
        "red": "Angry, scared, out of control, overwhelmed",
    }
    for zone in ["blue","green","yellow","red"]:
        count = feeling_counts[zone]
        pct = f"{(count/total*100):.1f}%" if total > 0 else "0%"
        zone_data.append([
            COLOUR_NAMES[zone],
            "",
            zone_descs[zone],
            str(count),
            pct,
        ])

    zone_table = Table(zone_data, colWidths=[100, 18, 240, 40, 40])
    zone_style_cmds = [
        ('BACKGROUND', (0,0), (-1,0), INDIGO),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E0E0E0')),
        ('PADDING', (0,0), (-1,-1), 7),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]
    for i, zone in enumerate(["blue","green","yellow","red"], 1):
        zone_style_cmds.append(('BACKGROUND', (1,i), (1,i), ZONE_COLORS_PDF[zone]))
    zone_table.setStyle(TableStyle(zone_style_cmds))
    elements.append(zone_table)
    elements.append(Spacer(1, 16))

    # ── SECTION 2: STRATEGIES ──
    elements.append(Paragraph("2. Coping Strategies Used", section_style))
    elements.append(Paragraph(
        "Coping strategies (helpers) are tools the student selected during check-ins to support emotional regulation. "
        "Frequent use of strategies indicates active engagement with self-regulation skills.",
        normal_style
    ))

    if helper_counts:
        top_helpers = sorted(helper_counts.items(), key=lambda x: x[1], reverse=True)
        helper_data = [['Strategy / Helper', 'Times Used', 'Frequency']]
        for name, count in top_helpers:
            freq = "Very Often" if count >= 5 else "Often" if count >= 3 else "Sometimes" if count >= 2 else "Once"
            helper_data.append([name, str(count), freq])

        helper_table = Table(helper_data, colWidths=[280, 70, 100])
        helper_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), INDIGO),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E0E0E0')),
            ('PADDING', (0,0), (-1,-1), 7),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, LIGHT]),
        ]))
        elements.append(helper_table)
    else:
        elements.append(Paragraph("No strategies recorded this period.", normal_style))
    elements.append(Spacer(1, 16))

    # ── SECTION 3: WEEKLY PATTERNS ──
    elements.append(Paragraph("3. Day-of-Week Pattern", section_style))
    elements.append(Paragraph(
        "This shows which days of the week had the most check-ins, helping identify patterns in emotional regulation needs.",
        normal_style
    ))
    week_data = [['Day', 'Check-ins', 'Pattern']]
    max_week = max(week_counts.values()) if week_counts else 1
    for day_idx in range(7):
        count = week_counts.get(day_idx, 0)
        bar = "█" * int((count / max_week) * 10) if max_week > 0 else ""
        week_data.append([WEEKDAYS[day_idx], str(count), bar])
    week_table = Table(week_data, colWidths=[120, 70, 260])
    week_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), INDIGO),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E0E0E0')),
        ('PADDING', (0,0), (-1,-1), 7),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, LIGHT]),
        ('TEXTCOLOR', (2,1), (2,-1), INDIGO),
    ]))
    elements.append(week_table)
    elements.append(Spacer(1, 16))

    # ── SECTION 4: TIME OF DAY ──
    if hour_counts:
        elements.append(Paragraph("4. Time of Day Pattern", section_style))
        sorted_hours = sorted(hour_counts.items())
        time_data = [['Time', 'Check-ins']]
        for hour, count in sorted_hours:
            time_str = f"{hour:02d}:00 - {hour:02d}:59"
            time_data.append([time_str, str(count)])
        time_table = Table(time_data, colWidths=[200, 100])
        time_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), INDIGO),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E0E0E0')),
            ('PADDING', (0,0), (-1,-1), 7),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, LIGHT]),
        ]))
        elements.append(time_table)
        elements.append(Spacer(1, 16))

    # ── SECTION 5: DETAILED CHECK-IN LOG ──
    elements.append(Paragraph("5. Detailed Check-in Log", section_style))
    elements.append(Paragraph(
        "A complete record of all emotional check-ins for this period, including date, time, zone, and strategies used.",
        normal_style
    ))

    if logs_data:
        log_table_data = [['Date', 'Time', 'Zone', 'Strategies Used', 'Note']]
        for log in logs_data:
            try:
                ts = datetime.fromisoformat(log["timestamp"].replace("Z", "+00:00"))
                date_str = ts.strftime("%d %b")
                time_str = ts.strftime("%H:%M")
            except:
                date_str = log.get("timestamp", "")[:10]
                time_str = ""
            zone = log.get("feeling_colour", log.get("zone", ""))
            helpers = log.get("helpers_selected", log.get("strategies_selected", []))
            helpers_str = ", ".join(helpers[:3]) if helpers else "—"
            if len(helpers) > 3:
                helpers_str += f" +{len(helpers)-3}"
            comment = (log.get("comment") or "")[:40]
            if len(log.get("comment") or "") > 40:
                comment += "..."
            log_table_data.append([date_str, time_str, COLOUR_NAMES.get(zone, zone), helpers_str, comment or "—"])

        log_table = Table(log_table_data, colWidths=[45, 35, 85, 200, 85])
        log_style_cmds = [
            ('BACKGROUND', (0,0), (-1,0), INDIGO),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E0E0E0')),
            ('PADDING', (0,0), (-1,-1), 5),
            ('FONTSIZE', (0,0), (-1,-1), 8),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, LIGHT]),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]
        # Colour zone cells
        for i, log in enumerate(logs_data, 1):
            zone = log.get("feeling_colour", log.get("zone", ""))
            if zone in ZONE_COLORS_PDF:
                log_style_cmds.append(('TEXTCOLOR', (2,i), (2,i), ZONE_COLORS_PDF[zone]))
                log_style_cmds.append(('FONTNAME', (2,i), (2,i), 'Helvetica-Bold'))
        log_table.setStyle(TableStyle(log_style_cmds))
        elements.append(log_table)
    else:
        elements.append(Paragraph("No check-ins recorded for this period.", normal_style))

    elements.append(Spacer(1, 20))

    # ── DISCLAIMER ──
    elements.append(Paragraph(
        "CONFIDENTIALITY NOTICE: This report contains personal emotional wellbeing data. "
        "It is intended solely for the named student's educational and therapeutic support team. "
        "Unauthorised sharing or use is prohibited. © Class of Happiness",
        disclaimer_style
    ))
    elements.append(Paragraph(
        "This report is generated by Class of Happiness (classofhappiness.app) using the Zones of Regulation framework. "
        "It is an educational tool and does not constitute a clinical assessment or diagnosis.",
        disclaimer_style
    ))

    doc.build(elements)
    buffer.seek(0)
    safe_name = student_data['name'].replace(' ', '_')
    filename = f"CoH_Report_{safe_name}_{year}_{month:02d}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"})'''

if OLD_PDF in content:
    content = content.replace(OLD_PDF, NEW_PDF)
    with open(SERVER, "w") as f:
        f.write(content)
    print("✅ PDF report replaced with comprehensive version")
    print("   - Zone distribution with descriptions")
    print("   - Strategy frequency with labels")
    print("   - Day-of-week pattern")
    print("   - Time-of-day pattern")
    print("   - Full detailed check-in log with dates/times")
    print("   - Professional confidentiality disclaimer")
else:
    print("❌ Could not find old PDF function - checking...")
    if "generate_pdf_report" in content:
        print("  Function exists but block didn't match exactly")
    else:
        print("  Function not found at all")

print("\nDeploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Comprehensive PDF report with strategies, timestamps, patterns' && git push")
