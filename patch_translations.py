"""
Run with: python3 patch_translations.py
Adds missing translation keys for teacher dashboard PT fixes.
"""
import os

SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

with open(SERVER, "r") as f:
    content = f.read()

# Find the marker — end of PT translations block
OLD = '"teacher_tab": "Professor",'
NEW = '''"teacher_tab": "Professor",

        "teacher_dashboard": "Painel do Professor",
        "add_widget_to_home": "Adicionar widget ao ecrã inicial",
        "add_quick_status": "Adicionar estado rápido ao ecrã inicial",
        "add_new_student": "Adicionar Novo Aluno",
        "family_strategies": "Estratégias da Família",
        "from_teacher": "Do Professor",
        "check_in_now": "Fazer Check-in Agora",
        "manage_and_support": "Gerir e apoiar a tua escola",
        "student_tab": "Aluno",'''

# Remove the old student_tab that would get duplicated
NEW = NEW.replace('\n        "student_tab": "Aluno",', '')

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(SERVER, "w") as f:
        f.write(content)
    print("✅ Missing translation keys added to server.py")
    print("Now deploy: git add -A && git commit -m 'Add missing PT translation keys' && git push")
else:
    # Try alternative marker
    OLD2 = '"student_tab": "Aluno",'
    NEW2 = '''"student_tab": "Aluno",
        "teacher_dashboard": "Painel do Professor",
        "add_widget_to_home": "Adicionar widget ao ecrã inicial",
        "add_quick_status": "Adicionar estado rápido ao ecrã inicial",
        "add_new_student": "Adicionar Novo Aluno",
        "family_strategies": "Estratégias da Família",
        "from_teacher": "Do Professor",
        "check_in_now": "Fazer Check-in Agora",
        "manage_and_support": "Gerir e apoiar a tua escola",'''
    if OLD2 in content:
        content = content.replace(OLD2, NEW2, 1)
        with open(SERVER, "w") as f:
            f.write(content)
        print("✅ Missing translation keys added (via alt marker)")
        print("Now deploy: git add -A && git commit -m 'Add missing PT translation keys' && git push")
    else:
        print("❌ Could not find insertion point — check server.py manually")
