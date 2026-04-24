"""
Run with: python3 patch_upload.py
Fixes resource upload - increases size limit and improves error handling
"""
import os

SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

with open(SERVER, "r") as f:
    content = f.read()

# Fix 1: Increase size limit from 800KB to 4MB base64 (~3MB file)
OLD_SIZE = """    if len(content) > 800000:
        raise HTTPException(status_code=413, detail="File too large. Please use a PDF under 500KB.")"""

NEW_SIZE = """    if len(content) > 4000000:
        raise HTTPException(status_code=413, detail="File too large. Please use a PDF under 2MB.")"""

if OLD_SIZE in content:
    content = content.replace(OLD_SIZE, NEW_SIZE)
    print("✅ Fix 1: Upload size limit increased to 4MB base64 (~3MB PDF)")
else:
    print("⚠️  Fix 1: Size limit line not found")

# Fix 2: Better error handling - don't strip columns on fallback
OLD_FALLBACK = """        try:
            fallback = {k: v for k, v in resource_data.items() if k not in ["topic", "target_audience", "pdf_filename"]}
            result = supabase.table("resources").insert(fallback).execute()
            return result.data[0] if result.data else resource_data
        except Exception as e2:
            raise HTTPException(status_code=500, detail="Failed to save resource")"""

NEW_FALLBACK = """        # Log full error for debugging
        logger.error(f"Resource insert error detail: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Failed to save resource: {error_msg[:100]}")"""

if OLD_FALLBACK in content:
    content = content.replace(OLD_FALLBACK, NEW_FALLBACK)
    print("✅ Fix 2: Better error message on upload failure")
else:
    print("⚠️  Fix 2: Fallback block not found")

with open(SERVER, "w") as f:
    f.write(content)

print("\n✅ Upload patch done!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix resource upload size limit and error handling' && git push")
