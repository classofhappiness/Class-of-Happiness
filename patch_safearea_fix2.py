"""
Run with: python3 patch_safearea_fix2.py
Simply replaces </SafeAreaView> back to </View> in the 3 broken files
since the opening tag wasn't changed. This restores them to working state.
The SafeAreaView is already handled by the Stack navigator in _layout.tsx.
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

files = [
    "app/auth/callback.tsx",
    "app/subscription/success.tsx", 
    "app/teacher/strategies.tsx",
]

for filepath in files:
    full_path = os.path.join(FRONTEND, filepath)
    with open(full_path, "r") as f:
        content = f.read()

    # Remove the SafeAreaView import we added
    content = content.replace(
        "\nimport { SafeAreaView } from 'react-native-safe-area-context';",
        ""
    )
    # Revert the mismatched closing tag back to </View>
    content = content.replace("    </SafeAreaView>\n  );\n}", "    </View>\n  );\n}")
    content = content.replace("  </SafeAreaView>\n);\n}", "  </View>\n);\n}")

    with open(full_path, "w") as f:
        f.write(content)
    print(f"✅ {filepath} - reverted to working state")

print("\nDeploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix SafeAreaView JSX mismatches' && git push")
