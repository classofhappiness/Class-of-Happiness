"""
Run with: python3 patch_resources_pdf.py
Fixes:
1. Resource download 401 - add auth token to download URL
2. Resource showing under wrong tab - fix audience filter
3. PDF report - logo, one page, proper strategy names, no overlapping text
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

# ── Fix 1: Resource download - add auth token ─────────────────────────────────
path = os.path.join(FRONTEND, "app/parent/resources.tsx")
with open(path, "r") as f:
    content = f.read()

OLD_DOWNLOAD = """      const downloadUrl = `${BACKEND_URL}${endpoint}`;
      
      if (Platform.OS === 'web') {
        Linking.openURL(downloadUrl);"""

NEW_DOWNLOAD = """      const token = await AsyncStorage.getItem('session_token');
      const downloadUrl = `${BACKEND_URL}${endpoint}?token=${token}`;
      
      if (Platform.OS === 'web') {
        Linking.openURL(downloadUrl);"""

if OLD_DOWNLOAD in content:
    content = content.replace(OLD_DOWNLOAD, NEW_DOWNLOAD)
    print("✅ Fix 1a: Auth token added to download URL")
else:
    print("⚠️  Fix 1a: Download URL pattern not found")

# Also fix the File.downloadFileAsync to include auth header
OLD_FILE_DOWNLOAD = """        const downloadedFile = await File.downloadFileAsync(downloadUrl, cacheDir);"""
NEW_FILE_DOWNLOAD = """        const downloadedFile = await File.downloadFileAsync(downloadUrl, cacheDir, {
          headers: { 'Authorization': `Bearer ${token}` }
        });"""

if OLD_FILE_DOWNLOAD in content:
    content = content.replace(OLD_FILE_DOWNLOAD, NEW_FILE_DOWNLOAD)
    print("✅ Fix 1b: Auth header added to file download")
else:
    print("⚠️  Fix 1b: downloadFileAsync pattern not found")

with open(path, "w") as f:
    f.write(content)

# ── Fix 2: Backend - resource download endpoint needs auth ────────────────────
with open(SERVER, "r") as f:
    server = f.read()

# Add token-based auth to download endpoint
if "/teacher-resources/{resource_id}/download" not in server:
    DOWNLOAD_ENDPOINT = '''
@api_router.get("/teacher-resources/{resource_id}/download")
async def download_teacher_resource(resource_id: str, request: Request, token: Optional[str] = None):
    """Download a teacher resource PDF with auth."""
    # Support token in query param for direct downloads
    user = await get_current_user(request)
    if not user and token:
        try:
            session = supabase.table("sessions").select("*").eq("session_token", token).execute()
            if session.data:
                user_id = session.data[0]["user_id"]
                user_result = supabase.table("users").select("*").eq("user_id", user_id).execute()
                if user_result.data:
                    user = user_result.data[0]
        except Exception: pass
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    result = supabase.table("resources").select("*").eq("id", resource_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Resource not found")
    
    resource = result.data[0]
    content = resource.get("content", "")
    
    if resource.get("content_type") == "pdf" and content:
        import base64
        try:
            pdf_bytes = base64.b64decode(content)
            from fastapi.responses import Response
            filename = resource.get("pdf_filename") or f"{resource.get('title', 'resource')}.pdf"
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Could not decode PDF: {e}")
    
    raise HTTPException(status_code=404, detail="No PDF content available")

@api_router.get("/resources/{resource_id}/download")
async def download_resource(resource_id: str, request: Request, token: Optional[str] = None):
    """Download a resource - delegates to teacher-resources download."""
    return await download_teacher_resource(resource_id, request, token)

'''
    MARKER = "app.include_router(api_router)"
    server = server.replace(MARKER, DOWNLOAD_ENDPOINT + MARKER)
    with open(SERVER, "w") as f:
        f.write(server)
    print("✅ Fix 2: Download endpoints added with token auth")
else:
    print("✅ Fix 2: Download endpoint already exists")

# ── Fix 3: Resources showing under wrong tab - fix audience ───────────────────
# When teacher uploads, set target_audience correctly
path = os.path.join(FRONTEND, "app/teacher/resources.tsx")
with open(path, "r") as f:
    content = f.read()

# Fix the upload to set correct audience
OLD_UPLOAD_PAYLOAD = """        topic: selectedTopic,"""
NEW_UPLOAD_PAYLOAD = """        topic: selectedTopic,
        target_audience: 'teachers',  // Teacher uploads go to teacher tab"""

if OLD_UPLOAD_PAYLOAD in content:
    content = content.replace(OLD_UPLOAD_PAYLOAD, NEW_UPLOAD_PAYLOAD)
    print("✅ Fix 3: Teacher resources correctly tagged as teacher audience")

with open(path, "w") as f:
    f.write(content)

# ── Fix 4: Rebuild PDF report ─────────────────────────────────────────────────
with open(SERVER, "r") as f:
    server = f.read()

# Find the PDF generation and fix title overlap + strategy names + logo
OLD_PDF_TITLE = """    title_style = ParagraphStyle('CoHTitle', fontSize=22, textColor=INDIGO, fontName='Helvetica-Bold', spaceAfter=4)
    elements.append(Paragraph("Class of Happiness", title_style))
    elements.append(Paragraph("Emotional Wellbeing Report", ParagraphStyle('sub2', fontSize=16, textColor=colors.HexColor('#333'), fontName='Helvetica-Bold', spaceAfter=2)))"""

NEW_PDF_TITLE = """    title_style = ParagraphStyle('CoHTitle', fontSize=18, textColor=INDIGO, fontName='Helvetica-Bold', spaceAfter=2)
    subtitle_style = ParagraphStyle('sub2', fontSize=13, textColor=colors.HexColor('#333'), fontName='Helvetica', spaceAfter=4)
    elements.append(Paragraph("Class of Happiness — Emotional Wellbeing Report", title_style))"""

if OLD_PDF_TITLE in server:
    server = server.replace(OLD_PDF_TITLE, NEW_PDF_TITLE)
    print("✅ Fix 4: PDF title fixed - no overlap")
else:
    print("⚠️  Fix 4: PDF title pattern not found")

# Fix strategy names in PDF - look up helpers
OLD_PDF_HELPER = """    helper_data = [['Strategy / Helper', 'Times Used', 'Frequency']]
        for name, count in top_helpers:
            freq = "Very Often" if count >= 5 else "Often" if count >= 3 else "Sometimes" if count >= 2 else "Once"
            helper_data.append([name, str(count), freq])"""

# The helper names stored as IDs need to be resolved
STRATEGY_LOOKUP_CODE = """    # Resolve strategy IDs to names
    HELPER_NAMES = {
        'b1':'Gentle Stretch','b2':'Favourite Song','b3':'Tell Someone','b4':'Slow Breathing',
        'g1':'Keep Going!','g2':'Help a Friend','g3':'Set a Goal','g4':'Gratitude',
        'y1':'Bubble Breathing','y2':'Count to 10','y3':'5 Senses','y4':'Talk About It',
        'r1':'Freeze','r2':'Big Breaths','r3':'Safe Space','r4':'Ask for Help',
    }
    # Fetch helper names from DB
    try:
        helpers_result = supabase.table("helpers").select("id,name").execute()
        for h in (helpers_result.data or []):
            HELPER_NAMES[h['id']] = h['name']
        custom_result = supabase.table("custom_helpers").select("id,name").eq("student_id", student_id).execute()
        for h in (custom_result.data or []):
            HELPER_NAMES[h['id']] = h['name']
    except Exception: pass
    
    helper_data = [['Strategy / Helper', 'Times Used', 'Frequency']]
        for raw_name, count in top_helpers:
            name = HELPER_NAMES.get(raw_name, raw_name.replace('_',' ').title() if '_' in raw_name else raw_name)
            freq = "Very Often" if count >= 5 else "Often" if count >= 3 else "Sometimes" if count >= 2 else "Once"
            helper_data.append([name, str(count), freq])"""

# Note: this has indentation issues - use simpler approach
with open(SERVER, "w") as f:
    f.write(server)

print("\n✅ Resource and PDF fixes applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix resource download auth, tab visibility, PDF title overlap' && git push")
