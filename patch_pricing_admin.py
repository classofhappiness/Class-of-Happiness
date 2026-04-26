"""
Run with: python3 patch_pricing_admin.py
"""
import os

SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")
FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# Fix pricing
with open(SERVER, "r") as f:
    content = f.read()

OLD = """SUBSCRIPTION_PLANS = {
    "monthly": {"price": 4.99, "name": "Monthly", "duration_days": 30},
    "six_month": {"price": 19.99, "name": "6 Months", "duration_days": 180},
    "annual": {"price": 35.00, "name": "Annual", "duration_days": 365}
}"""

NEW = """SUBSCRIPTION_PLANS = {
    "teacher_monthly": {
        "id": "teacher_monthly", "name": "Teacher", "type": "teacher",
        "price_eur": 7.99, "price_aud": 12.99,
        "label_eur": "€7.99/month", "label_aud": "A$12.99/month",
        "trial_days": 7, "duration_days": 30,
        "features": ["Unlimited classrooms","Unlimited students","PDF reports","Parent linking","Strategy management"],
    },
    "parent_monthly": {
        "id": "parent_monthly", "name": "Parent", "type": "parent",
        "price_eur": 3.99, "price_aud": 6.99,
        "label_eur": "€3.99/month", "label_aud": "A$6.99/month",
        "trial_days": 7, "duration_days": 30,
        "features": ["Unlimited family members","Home check-ins","Family strategies","School linking"],
    },
    "school_small": {
        "id": "school_small", "name": "School — Small", "type": "school",
        "price_eur": 399, "price_aud": 699,
        "label_eur": "€399/year", "label_aud": "A$699/year",
        "trial_days": 30, "duration_days": 365,
        "features": ["5 teacher accounts","150 students","School admin dashboard","All features"],
    },
    "school_large": {
        "id": "school_large", "name": "School — Large", "type": "school",
        "price_eur": 1499, "price_aud": 2499,
        "label_eur": "€1,499/year", "label_aud": "A$2,499/year",
        "trial_days": 30, "duration_days": 365,
        "features": ["Unlimited teachers","Unlimited students","Priority support","Custom branding"],
    },
}"""

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(SERVER, "w") as f:
        f.write(content)
    print("✅ Pricing updated with EUR/AUD for Portugal and Australia")
else:
    print("❌ Pricing pattern not found")

# Fix admin header - add logout button
path = os.path.join(FRONTEND, "app/admin/dashboard.tsx")
with open(path, "r") as f:
    content = f.read()

OLD_HEADER = """      <View style={[styles.header,{backgroundColor:headerColor}]}>
        <Text style={styles.headerTitle}>{isSuperAdmin ? 'Super Admin' : (t('school_admin_dashboard') || 'Admin Dashboard')}</Text>
        <Text style={styles.headerSub}>{user?.name||user?.email}</Text>
        <Text style={styles.headerRole} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{headerLabel}</Text>
      </View>"""

NEW_HEADER = """      <View style={[styles.header,{backgroundColor:headerColor}]}>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
          <View style={{flex:1}}>
            <Text style={styles.headerTitle}>{isSuperAdmin ? 'Super Admin' : (t('school_admin_dashboard') || 'Admin Dashboard')}</Text>
            <Text style={styles.headerSub}>{user?.name||user?.email}</Text>
            <Text style={styles.headerRole} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{headerLabel}</Text>
          </View>
          <TouchableOpacity
            onPress={() => Alert.alert('Logout', 'Are you sure you want to logout?', [
              {text:'Cancel',style:'cancel'},
              {text:'Logout',style:'destructive',onPress:() => signOut()}
            ])}
            style={{backgroundColor:'rgba(255,255,255,0.2)',padding:10,borderRadius:10,alignItems:'center'}}>
            <MaterialIcons name="logout" size={20} color="white" />
            <Text style={{color:'white',fontSize:10,marginTop:2}}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>"""

if OLD_HEADER in content:
    content = content.replace(OLD_HEADER, NEW_HEADER)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Admin header: logout button added")
else:
    print("❌ Admin header pattern not found")

print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix pricing EUR/AUD, admin logout button' && git push")
