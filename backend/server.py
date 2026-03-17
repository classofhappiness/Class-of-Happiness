from fastapi import FastAPI, APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timedelta, timezone
import httpx
import io
import calendar

# PDF Generation
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
from reportlab.graphics.shapes import Drawing, Rect
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.legends import Legend

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Stripe
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
stripe_api_key = os.environ.get('STRIPE_API_KEY')

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ================== SUBSCRIPTION PLANS ==================
SUBSCRIPTION_PLANS = {
    "monthly": {"price": 4.99, "name": "Monthly", "duration_days": 30},
    "six_month": {"price": 19.99, "name": "6 Months", "duration_days": 180},
    "annual": {"price": 35.00, "name": "Annual", "duration_days": 365}
}

TRIAL_DURATION_DAYS = 7

# ================== MODELS ==================

class User(BaseModel):
    user_id: str = Field(default_factory=lambda: f"user_{uuid.uuid4().hex[:12]}")
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "teacher"  # "teacher" or "admin"
    language: str = "en"
    subscription_status: str = "none"  # "none", "trial", "active", "expired"
    subscription_plan: Optional[str] = None
    subscription_expires_at: Optional[datetime] = None
    trial_started_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserSession(BaseModel):
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Student(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    avatar_type: str = "preset"
    avatar_preset: Optional[str] = "cat"
    avatar_custom: Optional[str] = None
    classroom_id: Optional[str] = None
    user_id: Optional[str] = None  # Teacher who created this student
    created_at: datetime = Field(default_factory=datetime.utcnow)

class StudentCreate(BaseModel):
    name: str
    avatar_type: str = "preset"
    avatar_preset: Optional[str] = "cat"
    avatar_custom: Optional[str] = None
    classroom_id: Optional[str] = None

class StudentUpdate(BaseModel):
    name: Optional[str] = None
    avatar_type: Optional[str] = None
    avatar_preset: Optional[str] = None
    avatar_custom: Optional[str] = None
    classroom_id: Optional[str] = None

class Classroom(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    teacher_name: Optional[str] = None
    user_id: Optional[str] = None  # Teacher who created this classroom
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ClassroomCreate(BaseModel):
    name: str
    teacher_name: Optional[str] = None

class ZoneLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    zone: str
    strategies_selected: List[str] = []
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ZoneLogCreate(BaseModel):
    student_id: str
    zone: str
    strategies_selected: List[str] = []

# Custom strategy for specific student
class CustomStrategy(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: Optional[str] = None  # None means global/default strategy
    user_id: Optional[str] = None  # Teacher who created this
    name: str
    description: str
    zone: str
    image_type: str = "icon"  # "icon" or "custom"
    icon: str = "star"
    custom_image: Optional[str] = None  # base64 image
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CustomStrategyCreate(BaseModel):
    student_id: Optional[str] = None
    name: str
    description: str
    zone: str
    image_type: str = "icon"
    icon: str = "star"
    custom_image: Optional[str] = None

class CustomStrategyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    zone: Optional[str] = None
    image_type: Optional[str] = None
    icon: Optional[str] = None
    custom_image: Optional[str] = None
    is_active: Optional[bool] = None

class PaymentTransaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    session_id: str
    plan: str
    amount: float
    currency: str = "usd"
    payment_status: str = "pending"  # "pending", "paid", "failed", "expired"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ================== PRESET AVATARS ==================
PRESET_AVATARS = [
    {"id": "cat", "name": "Cat", "emoji": "🐱"},
    {"id": "dog", "name": "Dog", "emoji": "🐶"},
    {"id": "bear", "name": "Bear", "emoji": "🐻"},
    {"id": "bunny", "name": "Bunny", "emoji": "🐰"},
    {"id": "lion", "name": "Lion", "emoji": "🦁"},
    {"id": "panda", "name": "Panda", "emoji": "🐼"},
    {"id": "monkey", "name": "Monkey", "emoji": "🐵"},
    {"id": "unicorn", "name": "Unicorn", "emoji": "🦄"},
    {"id": "star", "name": "Star", "emoji": "⭐"},
    {"id": "rainbow", "name": "Rainbow", "emoji": "🌈"},
]

# ================== STRATEGY ICONS ==================
STRATEGY_ICONS = [
    # Movement & Exercise
    "fitness-center", "directions-walk", "directions-run", "pool", "sports-soccer",
    "sports-baseball", "sports-basketball", "sports-tennis", "hiking", "rowing",
    # Communication
    "chat", "forum", "support-agent", "record-voice-over", "campaign",
    # Relaxation & Wellness
    "spa", "self-improvement", "psychology", "air", "weekend", "bathtub",
    "local-cafe", "local-drink", "restaurant", "cake",
    # Nature & Outdoors
    "wb-sunny", "nature", "park", "grass", "forest", "pets", "eco",
    # Emotions & Feelings  
    "favorite", "emoji-emotions", "sentiment-very-satisfied", "sentiment-satisfied",
    "sentiment-neutral", "sentiment-dissatisfied", "mood", "face",
    # Music & Art
    "music-note", "headphones", "piano", "brush", "palette", "color-lens",
    # Mindfulness
    "visibility", "visibility-off", "timer", "hourglass-empty", "access-time",
    # Actions
    "thumb-up", "thumb-down", "pan-tool", "back-hand", "front-hand", "waving-hand",
    # Home & Safety
    "home", "shield", "security", "lock", "night-shelter",
    # Learning & Focus
    "school", "menu-book", "edit", "lightbulb", "tips-and-updates",
    # Misc
    "star", "filter-9-plus", "exposure-neg-1", "volunteer-activism",
    "celebration", "emoji-events", "workspace-premium", "military-tech",
    # Body & Health
    "accessibility", "hearing", "remove-red-eye", "touch-app",
    # Play
    "toys", "videogame-asset", "sports-esports", "extension", "casino"
]

# ================== DEFAULT STRATEGIES ==================
DEFAULT_STRATEGIES = [
    # Blue Zone (Low energy - sad, tired, bored)
    {"id": "blue_1", "name": "Get Moving", "description": "Stretch or do some jumping jacks", "zone": "blue", "icon": "fitness-center", "image_type": "icon"},
    {"id": "blue_2", "name": "Talk to Someone", "description": "Share how you feel with a friend or teacher", "zone": "blue", "icon": "chat", "image_type": "icon"},
    {"id": "blue_3", "name": "Drink Water", "description": "Have a refreshing drink of water", "zone": "blue", "icon": "local-drink", "image_type": "icon"},
    {"id": "blue_4", "name": "Take a Break", "description": "Rest for a few minutes", "zone": "blue", "icon": "weekend", "image_type": "icon"},
    {"id": "blue_5", "name": "Listen to Music", "description": "Put on your favorite upbeat song", "zone": "blue", "icon": "music-note", "image_type": "icon"},
    {"id": "blue_6", "name": "Go Outside", "description": "Get some fresh air", "zone": "blue", "icon": "wb-sunny", "image_type": "icon"},
    
    # Green Zone (Ready to learn - calm, happy, focused)
    {"id": "green_1", "name": "Keep Going!", "description": "You're doing great, stay focused", "zone": "green", "icon": "thumb-up", "image_type": "icon"},
    {"id": "green_2", "name": "Deep Breaths", "description": "Take 3 slow, deep breaths", "zone": "green", "icon": "air", "image_type": "icon"},
    {"id": "green_3", "name": "Stay Focused", "description": "Keep your eyes on your work", "zone": "green", "icon": "visibility", "image_type": "icon"},
    {"id": "green_4", "name": "High Five!", "description": "Give yourself a high five", "zone": "green", "icon": "pan-tool", "image_type": "icon"},
    {"id": "green_5", "name": "Help Others", "description": "Share your calm energy", "zone": "green", "icon": "favorite", "image_type": "icon"},
    {"id": "green_6", "name": "Smile", "description": "Keep that happy feeling", "zone": "green", "icon": "sentiment-very-satisfied", "image_type": "icon"},
    
    # Yellow Zone (Heightened - frustrated, worried, silly, excited)
    {"id": "yellow_1", "name": "Count to 10", "description": "Slowly count from 1 to 10", "zone": "yellow", "icon": "filter-9-plus", "image_type": "icon"},
    {"id": "yellow_2", "name": "Deep Breaths", "description": "Breathe in for 4, out for 4", "zone": "yellow", "icon": "air", "image_type": "icon"},
    {"id": "yellow_3", "name": "Squeeze Ball", "description": "Squeeze a stress ball or fidget", "zone": "yellow", "icon": "sports-baseball", "image_type": "icon"},
    {"id": "yellow_4", "name": "Walk Away", "description": "Take a short walk to calm down", "zone": "yellow", "icon": "directions-walk", "image_type": "icon"},
    {"id": "yellow_5", "name": "Get Water", "description": "Take a drink of water", "zone": "yellow", "icon": "local-drink", "image_type": "icon"},
    {"id": "yellow_6", "name": "Think Happy", "description": "Think of something that makes you happy", "zone": "yellow", "icon": "wb-sunny", "image_type": "icon"},
    
    # Red Zone (Extreme - angry, terrified, out of control)
    {"id": "red_1", "name": "STOP", "description": "Stop and freeze your body", "zone": "red", "icon": "pan-tool", "image_type": "icon"},
    {"id": "red_2", "name": "Breathe Deep", "description": "Take 5 very slow breaths", "zone": "red", "icon": "air", "image_type": "icon"},
    {"id": "red_3", "name": "Count Back", "description": "Count backwards from 10 to 1", "zone": "red", "icon": "exposure-neg-1", "image_type": "icon"},
    {"id": "red_4", "name": "Safe Space", "description": "Go to your calm down corner", "zone": "red", "icon": "home", "image_type": "icon"},
    {"id": "red_5", "name": "Ask for Help", "description": "Tell an adult you need help", "zone": "red", "icon": "support-agent", "image_type": "icon"},
    {"id": "red_6", "name": "Hug Yourself", "description": "Give yourself a big hug", "zone": "red", "icon": "favorite", "image_type": "icon"},
]

# ================== TRANSLATIONS ==================
TRANSLATIONS = {
    "en": {
        "zones_of_regulation": "Zones of Regulation",
        "how_are_you_feeling": "How are you feeling today?",
        "i_am_a": "I am a...",
        "student": "Student",
        "teacher": "Teacher",
        "check_in_feelings": "Check in with my feelings",
        "view_progress": "View student progress",
        "blue_zone": "Blue Zone",
        "green_zone": "Green Zone",
        "yellow_zone": "Yellow Zone",
        "red_zone": "Red Zone",
        "blue_desc": "Sad, Tired, Bored",
        "green_desc": "Calm, Happy, Focused",
        "yellow_desc": "Worried, Frustrated, Silly",
        "red_desc": "Angry, Scared, Out of Control",
        "select_profile": "Select Your Profile",
        "tap_to_check_in": "Tap your picture to check in!",
        "add_profile": "Add Profile",
        "strategies": "Helpful Strategies",
        "skip": "Skip",
        "done": "Done",
        "settings": "Settings",
        "language": "Language",
        "subscription": "Subscription",
        "logout": "Logout",
        "login": "Login",
        "sign_in_google": "Sign in with Google",
        "trial": "Free Trial",
        "trial_desc": "7 days free trial",
        "monthly": "Monthly",
        "six_months": "6 Months",
        "annual": "Annual",
        "subscribe": "Subscribe",
        "per_month": "/month",
        "save": "Save",
    },
    "es": {
        "zones_of_regulation": "Zonas de Regulación",
        "how_are_you_feeling": "¿Cómo te sientes hoy?",
        "i_am_a": "Soy un...",
        "student": "Estudiante",
        "teacher": "Maestro",
        "check_in_feelings": "Registrar mis sentimientos",
        "view_progress": "Ver progreso de estudiantes",
        "blue_zone": "Zona Azul",
        "green_zone": "Zona Verde",
        "yellow_zone": "Zona Amarilla",
        "red_zone": "Zona Roja",
        "blue_desc": "Triste, Cansado, Aburrido",
        "green_desc": "Tranquilo, Feliz, Enfocado",
        "yellow_desc": "Preocupado, Frustrado, Tonto",
        "red_desc": "Enojado, Asustado, Fuera de Control",
        "select_profile": "Selecciona tu Perfil",
        "tap_to_check_in": "¡Toca tu foto para registrarte!",
        "add_profile": "Agregar Perfil",
        "strategies": "Estrategias Útiles",
        "skip": "Saltar",
        "done": "Listo",
        "settings": "Configuración",
        "language": "Idioma",
        "subscription": "Suscripción",
        "logout": "Cerrar Sesión",
        "login": "Iniciar Sesión",
        "sign_in_google": "Iniciar con Google",
        "trial": "Prueba Gratuita",
        "trial_desc": "7 días de prueba gratis",
        "monthly": "Mensual",
        "six_months": "6 Meses",
        "annual": "Anual",
        "subscribe": "Suscribirse",
        "per_month": "/mes",
        "save": "Guardar",
    },
    "fr": {
        "zones_of_regulation": "Zones de Régulation",
        "how_are_you_feeling": "Comment te sens-tu aujourd'hui?",
        "i_am_a": "Je suis un...",
        "student": "Élève",
        "teacher": "Enseignant",
        "check_in_feelings": "Enregistrer mes émotions",
        "view_progress": "Voir les progrès des élèves",
        "blue_zone": "Zone Bleue",
        "green_zone": "Zone Verte",
        "yellow_zone": "Zone Jaune",
        "red_zone": "Zone Rouge",
        "blue_desc": "Triste, Fatigué, Ennuyé",
        "green_desc": "Calme, Heureux, Concentré",
        "yellow_desc": "Inquiet, Frustré, Excité",
        "red_desc": "En Colère, Effrayé, Hors Contrôle",
        "select_profile": "Sélectionne ton Profil",
        "tap_to_check_in": "Tape sur ta photo pour t'enregistrer!",
        "add_profile": "Ajouter Profil",
        "strategies": "Stratégies Utiles",
        "skip": "Passer",
        "done": "Terminé",
        "settings": "Paramètres",
        "language": "Langue",
        "subscription": "Abonnement",
        "logout": "Déconnexion",
        "login": "Connexion",
        "sign_in_google": "Se connecter avec Google",
        "trial": "Essai Gratuit",
        "trial_desc": "7 jours d'essai gratuit",
        "monthly": "Mensuel",
        "six_months": "6 Mois",
        "annual": "Annuel",
        "subscribe": "S'abonner",
        "per_month": "/mois",
        "save": "Sauvegarder",
    },
    "pt": {
        "zones_of_regulation": "Zonas de Regulação",
        "how_are_you_feeling": "Como você está se sentindo hoje?",
        "i_am_a": "Eu sou um...",
        "student": "Estudante",
        "teacher": "Professor",
        "check_in_feelings": "Registrar meus sentimentos",
        "view_progress": "Ver progresso dos alunos",
        "blue_zone": "Zona Azul",
        "green_zone": "Zona Verde",
        "yellow_zone": "Zona Amarela",
        "red_zone": "Zona Vermelha",
        "blue_desc": "Triste, Cansado, Entediado",
        "green_desc": "Calmo, Feliz, Focado",
        "yellow_desc": "Preocupado, Frustrado, Bobo",
        "red_desc": "Bravo, Assustado, Fora de Controle",
        "select_profile": "Selecione seu Perfil",
        "tap_to_check_in": "Toque na sua foto para registrar!",
        "add_profile": "Adicionar Perfil",
        "strategies": "Estratégias Úteis",
        "skip": "Pular",
        "done": "Pronto",
        "settings": "Configurações",
        "language": "Idioma",
        "subscription": "Assinatura",
        "logout": "Sair",
        "login": "Entrar",
        "sign_in_google": "Entrar com Google",
        "trial": "Teste Gratuito",
        "trial_desc": "7 dias de teste grátis",
        "monthly": "Mensal",
        "six_months": "6 Meses",
        "annual": "Anual",
        "subscribe": "Assinar",
        "per_month": "/mês",
        "save": "Salvar",
    },
    "de": {
        "zones_of_regulation": "Zonen der Regulierung",
        "how_are_you_feeling": "Wie fühlst du dich heute?",
        "i_am_a": "Ich bin ein...",
        "student": "Schüler",
        "teacher": "Lehrer",
        "check_in_feelings": "Meine Gefühle einchecken",
        "view_progress": "Schülerfortschritt ansehen",
        "blue_zone": "Blaue Zone",
        "green_zone": "Grüne Zone",
        "yellow_zone": "Gelbe Zone",
        "red_zone": "Rote Zone",
        "blue_desc": "Traurig, Müde, Gelangweilt",
        "green_desc": "Ruhig, Glücklich, Fokussiert",
        "yellow_desc": "Besorgt, Frustriert, Albern",
        "red_desc": "Wütend, Verängstigt, Außer Kontrolle",
        "select_profile": "Wähle dein Profil",
        "tap_to_check_in": "Tippe auf dein Bild zum Einchecken!",
        "add_profile": "Profil Hinzufügen",
        "strategies": "Hilfreiche Strategien",
        "skip": "Überspringen",
        "done": "Fertig",
        "settings": "Einstellungen",
        "language": "Sprache",
        "subscription": "Abonnement",
        "logout": "Abmelden",
        "login": "Anmelden",
        "sign_in_google": "Mit Google anmelden",
        "trial": "Kostenlose Testversion",
        "trial_desc": "7 Tage kostenlos testen",
        "monthly": "Monatlich",
        "six_months": "6 Monate",
        "annual": "Jährlich",
        "subscribe": "Abonnieren",
        "per_month": "/Monat",
        "save": "Speichern",
    }
}

# ================== HELPER FUNCTIONS ==================

async def get_current_user(request: Request) -> Optional[User]:
    """Get current user from session token in cookie or Authorization header"""
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    
    if not session_token:
        return None
    
    session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session_doc:
        return None
    
    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    
    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        return None
    
    return User(**user_doc)

def check_subscription_active(user: User) -> bool:
    """Check if user has active subscription or trial"""
    if user.subscription_status == "active":
        if user.subscription_expires_at:
            expires = user.subscription_expires_at
            if isinstance(expires, str):
                expires = datetime.fromisoformat(expires)
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            return expires > datetime.now(timezone.utc)
    elif user.subscription_status == "trial":
        if user.trial_started_at:
            trial_start = user.trial_started_at
            if isinstance(trial_start, str):
                trial_start = datetime.fromisoformat(trial_start)
            if trial_start.tzinfo is None:
                trial_start = trial_start.replace(tzinfo=timezone.utc)
            trial_end = trial_start + timedelta(days=TRIAL_DURATION_DAYS)
            return datetime.now(timezone.utc) < trial_end
    return False

# ================== ROUTES ==================

@api_router.get("/")
async def root():
    return {"message": "Zones of Regulation API", "status": "running"}

# ---- Translations ----
@api_router.get("/translations/{lang}")
async def get_translations(lang: str):
    if lang not in TRANSLATIONS:
        lang = "en"
    return TRANSLATIONS[lang]

@api_router.get("/translations")
async def get_all_translations():
    return TRANSLATIONS

@api_router.get("/languages")
async def get_languages():
    return [
        {"code": "en", "name": "English"},
        {"code": "es", "name": "Español"},
        {"code": "fr", "name": "Français"},
        {"code": "pt", "name": "Português"},
        {"code": "de", "name": "Deutsch"}
    ]

# ---- Auth Routes ----
@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange session_id for session data"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Call Emergent Auth API
    async with httpx.AsyncClient() as client:
        auth_response = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
    
    if auth_response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    auth_data = auth_response.json()
    email = auth_data.get("email")
    name = auth_data.get("name")
    picture = auth_data.get("picture")
    session_token = auth_data.get("session_token")
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        # Update user info
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}}
        )
    else:
        # Create new user with trial
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        new_user = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "role": "teacher",
            "language": "en",
            "subscription_status": "trial",
            "subscription_plan": None,
            "subscription_expires_at": None,
            "trial_started_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(new_user)
    
    # Create session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    session_doc = {
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc)
    }
    
    # Remove old sessions for this user
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one(session_doc)
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    # Get user data
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    return user_doc

@api_router.get("/auth/me")
async def get_current_user_info(request: Request):
    """Get current logged-in user"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check and update subscription status
    user_dict = user.dict()
    if user.subscription_status == "trial":
        if not check_subscription_active(user):
            # Trial expired
            await db.users.update_one(
                {"user_id": user.user_id},
                {"$set": {"subscription_status": "expired"}}
            )
            user_dict["subscription_status"] = "expired"
    elif user.subscription_status == "active":
        if not check_subscription_active(user):
            # Subscription expired
            await db.users.update_one(
                {"user_id": user.user_id},
                {"$set": {"subscription_status": "expired"}}
            )
            user_dict["subscription_status"] = "expired"
    
    return user_dict

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout current user"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}

@api_router.put("/auth/language")
async def update_language(request: Request):
    """Update user's preferred language"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    body = await request.json()
    language = body.get("language", "en")
    
    if language not in TRANSLATIONS:
        language = "en"
    
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"language": language}}
    )
    
    return {"language": language}

# ---- Subscription Routes ----
@api_router.get("/subscription/plans")
async def get_subscription_plans():
    """Get available subscription plans"""
    return {
        "plans": SUBSCRIPTION_PLANS,
        "trial_days": TRIAL_DURATION_DAYS
    }

@api_router.post("/subscription/start-trial")
async def start_trial(request: Request):
    """Start free trial for user"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.trial_started_at:
        raise HTTPException(status_code=400, detail="Trial already started")
    
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "subscription_status": "trial",
            "trial_started_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": "Trial started", "trial_days": TRIAL_DURATION_DAYS}

@api_router.post("/subscription/checkout")
async def create_checkout(request: Request):
    """Create Stripe checkout session for subscription"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    body = await request.json()
    plan = body.get("plan")
    origin_url = body.get("origin_url")
    
    if plan not in SUBSCRIPTION_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    if not origin_url:
        raise HTTPException(status_code=400, detail="origin_url required")
    
    plan_details = SUBSCRIPTION_PLANS[plan]
    amount = plan_details["price"]
    
    # Initialize Stripe
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    
    success_url = f"{origin_url}/subscription/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}/subscription"
    
    checkout_request = CheckoutSessionRequest(
        amount=float(amount),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user.user_id,
            "plan": plan,
            "email": user.email
        }
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Create payment transaction record
    transaction = {
        "id": str(uuid.uuid4()),
        "user_id": user.user_id,
        "session_id": session.session_id,
        "plan": plan,
        "amount": float(amount),
        "currency": "usd",
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc)
    }
    await db.payment_transactions.insert_one(transaction)
    
    return {"url": session.url, "session_id": session.session_id}

@api_router.get("/subscription/status/{session_id}")
async def get_payment_status(session_id: str, request: Request):
    """Get payment status and update subscription if paid"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if already processed
    transaction = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": user.user_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if transaction["payment_status"] == "paid":
        return {"status": "paid", "message": "Payment already processed"}
    
    # Check with Stripe
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
    
    status = await stripe_checkout.get_checkout_status(session_id)
    
    if status.payment_status == "paid":
        # Update transaction
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "paid"}}
        )
        
        # Update user subscription
        plan = transaction["plan"]
        plan_details = SUBSCRIPTION_PLANS[plan]
        expires_at = datetime.now(timezone.utc) + timedelta(days=plan_details["duration_days"])
        
        await db.users.update_one(
            {"user_id": user.user_id},
            {"$set": {
                "subscription_status": "active",
                "subscription_plan": plan,
                "subscription_expires_at": expires_at
            }}
        )
        
        return {"status": "paid", "plan": plan, "expires_at": expires_at.isoformat()}
    
    return {"status": status.payment_status}

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks"""
    body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    
    try:
        host_url = str(request.base_url).rstrip("/")
        webhook_url = f"{host_url}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=stripe_api_key, webhook_url=webhook_url)
        
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        if webhook_response.payment_status == "paid":
            session_id = webhook_response.session_id
            metadata = webhook_response.metadata
            
            # Update transaction
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {"payment_status": "paid"}}
            )
            
            # Update user subscription
            user_id = metadata.get("user_id")
            plan = metadata.get("plan")
            
            if user_id and plan and plan in SUBSCRIPTION_PLANS:
                plan_details = SUBSCRIPTION_PLANS[plan]
                expires_at = datetime.now(timezone.utc) + timedelta(days=plan_details["duration_days"])
                
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        "subscription_status": "active",
                        "subscription_plan": plan,
                        "subscription_expires_at": expires_at
                    }}
                )
        
        return {"status": "ok"}
    except Exception as e:
        logging.error(f"Webhook error: {e}")
        return {"status": "error"}

# ---- Avatars ----
@api_router.get("/avatars")
async def get_preset_avatars():
    return PRESET_AVATARS

# ---- Strategy Icons ----
@api_router.get("/strategy-icons")
async def get_strategy_icons():
    return STRATEGY_ICONS

# ---- Students ----
@api_router.post("/students", response_model=Student)
async def create_student(student: StudentCreate, request: Request):
    user = await get_current_user(request)
    student_dict = student.dict()
    student_obj = Student(**student_dict)
    if user:
        student_obj.user_id = user.user_id
    await db.students.insert_one(student_obj.dict())
    return student_obj

@api_router.get("/students", response_model=List[Student])
async def get_students(classroom_id: Optional[str] = None, request: Request = None):
    query = {}
    if classroom_id:
        query["classroom_id"] = classroom_id
    students = await db.students.find(query).to_list(1000)
    return [Student(**s) for s in students]

@api_router.get("/students/{student_id}", response_model=Student)
async def get_student(student_id: str):
    student = await db.students.find_one({"id": student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return Student(**student)

@api_router.put("/students/{student_id}", response_model=Student)
async def update_student(student_id: str, update: StudentUpdate):
    student = await db.students.find_one({"id": student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    if update_data:
        await db.students.update_one({"id": student_id}, {"$set": update_data})
    
    updated = await db.students.find_one({"id": student_id})
    return Student(**updated)

@api_router.delete("/students/{student_id}")
async def delete_student(student_id: str):
    result = await db.students.delete_one({"id": student_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")
    await db.zone_logs.delete_many({"student_id": student_id})
    await db.custom_strategies.delete_many({"student_id": student_id})
    return {"message": "Student deleted successfully"}

# ---- Classrooms ----
@api_router.post("/classrooms", response_model=Classroom)
async def create_classroom(classroom: ClassroomCreate, request: Request):
    user = await get_current_user(request)
    classroom_dict = classroom.dict()
    classroom_obj = Classroom(**classroom_dict)
    if user:
        classroom_obj.user_id = user.user_id
    await db.classrooms.insert_one(classroom_obj.dict())
    return classroom_obj

@api_router.get("/classrooms", response_model=List[Classroom])
async def get_classrooms():
    classrooms = await db.classrooms.find().to_list(1000)
    return [Classroom(**c) for c in classrooms]

@api_router.get("/classrooms/{classroom_id}", response_model=Classroom)
async def get_classroom(classroom_id: str):
    classroom = await db.classrooms.find_one({"id": classroom_id})
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")
    return Classroom(**classroom)

@api_router.delete("/classrooms/{classroom_id}")
async def delete_classroom(classroom_id: str):
    result = await db.classrooms.delete_one({"id": classroom_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Classroom not found")
    await db.students.update_many({"classroom_id": classroom_id}, {"$set": {"classroom_id": None}})
    return {"message": "Classroom deleted successfully"}

# ---- Strategies ----
@api_router.get("/strategies")
async def get_strategies(zone: Optional[str] = None, student_id: Optional[str] = None):
    """Get strategies - default + custom for student"""
    # Start with default strategies
    if zone:
        strategies = [s for s in DEFAULT_STRATEGIES if s["zone"] == zone]
    else:
        strategies = DEFAULT_STRATEGIES.copy()
    
    # Add custom strategies for student
    if student_id:
        query = {"student_id": student_id, "is_active": True}
        if zone:
            query["zone"] = zone
        custom = await db.custom_strategies.find(query).to_list(1000)
        for c in custom:
            strategies.append({
                "id": c["id"],
                "name": c["name"],
                "description": c["description"],
                "zone": c["zone"],
                "icon": c.get("icon", "star"),
                "image_type": c.get("image_type", "icon"),
                "custom_image": c.get("custom_image"),
                "is_custom": True
            })
    
    return strategies

@api_router.get("/strategies/student/{student_id}")
async def get_student_strategies(student_id: str, zone: Optional[str] = None):
    """Get all strategies for a specific student (defaults + custom)"""
    return await get_strategies(zone=zone, student_id=student_id)

# ---- Custom Strategies (Teacher Management) ----
@api_router.post("/custom-strategies", response_model=CustomStrategy)
async def create_custom_strategy(strategy: CustomStrategyCreate, request: Request):
    """Create a custom strategy for a student"""
    user = await get_current_user(request)
    
    strategy_dict = strategy.dict()
    strategy_obj = CustomStrategy(**strategy_dict)
    if user:
        strategy_obj.user_id = user.user_id
    
    await db.custom_strategies.insert_one(strategy_obj.dict())
    return strategy_obj

@api_router.get("/custom-strategies")
async def get_custom_strategies(student_id: Optional[str] = None, request: Request = None):
    """Get custom strategies, optionally filtered by student"""
    query = {}
    if student_id:
        query["student_id"] = student_id
    
    strategies = await db.custom_strategies.find(query).to_list(1000)
    return [CustomStrategy(**s) for s in strategies]

@api_router.get("/custom-strategies/{strategy_id}")
async def get_custom_strategy(strategy_id: str):
    strategy = await db.custom_strategies.find_one({"id": strategy_id})
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return CustomStrategy(**strategy)

@api_router.put("/custom-strategies/{strategy_id}")
async def update_custom_strategy(strategy_id: str, update: CustomStrategyUpdate):
    """Update a custom strategy"""
    strategy = await db.custom_strategies.find_one({"id": strategy_id})
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    if update_data:
        await db.custom_strategies.update_one({"id": strategy_id}, {"$set": update_data})
    
    updated = await db.custom_strategies.find_one({"id": strategy_id})
    return CustomStrategy(**updated)

@api_router.delete("/custom-strategies/{strategy_id}")
async def delete_custom_strategy(strategy_id: str):
    """Delete a custom strategy"""
    result = await db.custom_strategies.delete_one({"id": strategy_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return {"message": "Strategy deleted successfully"}

# ---- Zone Logs ----
@api_router.post("/zone-logs", response_model=ZoneLog)
async def create_zone_log(log: ZoneLogCreate):
    student = await db.students.find_one({"id": log.student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    log_dict = log.dict()
    log_obj = ZoneLog(**log_dict)
    await db.zone_logs.insert_one(log_obj.dict())
    return log_obj

@api_router.get("/zone-logs", response_model=List[ZoneLog])
async def get_zone_logs(
    student_id: Optional[str] = None,
    classroom_id: Optional[str] = None,
    days: int = 7
):
    start_date = datetime.utcnow() - timedelta(days=days)
    query = {"timestamp": {"$gte": start_date}}
    
    if student_id:
        query["student_id"] = student_id
    elif classroom_id:
        students = await db.students.find({"classroom_id": classroom_id}).to_list(1000)
        student_ids = [s["id"] for s in students]
        query["student_id"] = {"$in": student_ids}
    
    logs = await db.zone_logs.find(query).sort("timestamp", -1).to_list(1000)
    return [ZoneLog(**log) for log in logs]

@api_router.get("/zone-logs/student/{student_id}", response_model=List[ZoneLog])
async def get_student_zone_logs(student_id: str, days: int = 30):
    start_date = datetime.utcnow() - timedelta(days=days)
    logs = await db.zone_logs.find({
        "student_id": student_id,
        "timestamp": {"$gte": start_date}
    }).sort("timestamp", -1).to_list(1000)
    return [ZoneLog(**log) for log in logs]

# ---- Analytics ----
@api_router.get("/analytics/student/{student_id}")
async def get_student_analytics(student_id: str, days: int = 7):
    start_date = datetime.utcnow() - timedelta(days=days)
    
    logs = await db.zone_logs.find({
        "student_id": student_id,
        "timestamp": {"$gte": start_date}
    }).sort("timestamp", 1).to_list(1000)
    
    zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    strategy_counts = {}
    daily_data = {}
    
    for log in logs:
        zone = log.get("zone", "")
        if zone in zone_counts:
            zone_counts[zone] += 1
        
        for strategy in log.get("strategies_selected", []):
            strategy_counts[strategy] = strategy_counts.get(strategy, 0) + 1
        
        day = log["timestamp"].strftime("%Y-%m-%d")
        if day not in daily_data:
            daily_data[day] = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
        if zone in daily_data[day]:
            daily_data[day][zone] += 1
    
    top_strategies = sorted(strategy_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    
    return {
        "zone_counts": zone_counts,
        "total_logs": len(logs),
        "strategy_counts": dict(top_strategies),
        "daily_data": daily_data,
        "period_days": days
    }

@api_router.get("/analytics/classroom/{classroom_id}")
async def get_classroom_analytics(classroom_id: str, days: int = 7):
    start_date = datetime.utcnow() - timedelta(days=days)
    
    students = await db.students.find({"classroom_id": classroom_id}).to_list(1000)
    student_ids = [s["id"] for s in students]
    
    if not student_ids:
        return {
            "zone_counts": {"blue": 0, "green": 0, "yellow": 0, "red": 0},
            "total_logs": 0,
            "students_count": 0,
            "daily_data": {},
            "student_breakdown": []
        }
    
    logs = await db.zone_logs.find({
        "student_id": {"$in": student_ids},
        "timestamp": {"$gte": start_date}
    }).sort("timestamp", 1).to_list(1000)
    
    zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    daily_data = {}
    student_breakdown = {sid: {"blue": 0, "green": 0, "yellow": 0, "red": 0} for sid in student_ids}
    
    for log in logs:
        zone = log.get("zone", "")
        student_id = log.get("student_id", "")
        
        if zone in zone_counts:
            zone_counts[zone] += 1
        
        if student_id in student_breakdown and zone in student_breakdown[student_id]:
            student_breakdown[student_id][zone] += 1
        
        day = log["timestamp"].strftime("%Y-%m-%d")
        if day not in daily_data:
            daily_data[day] = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
        if zone in daily_data[day]:
            daily_data[day][zone] += 1
    
    student_data = []
    for s in students:
        student_data.append({
            "id": s["id"],
            "name": s["name"],
            "zones": student_breakdown.get(s["id"], {"blue": 0, "green": 0, "yellow": 0, "red": 0})
        })
    
    return {
        "zone_counts": zone_counts,
        "total_logs": len(logs),
        "students_count": len(students),
        "daily_data": daily_data,
        "student_breakdown": student_data,
        "period_days": days
    }

# ---- Available Months for Reports ----
@api_router.get("/reports/available-months/{student_id}")
async def get_available_months(student_id: str):
    """Get list of months that have data for a student"""
    logs = await db.zone_logs.find(
        {"student_id": student_id},
        {"timestamp": 1}
    ).sort("timestamp", 1).to_list(10000)
    
    months = set()
    for log in logs:
        ts = log["timestamp"]
        months.add(f"{ts.year}-{ts.month:02d}")
    
    return sorted(list(months), reverse=True)

# ---- Monthly Analytics ----
@api_router.get("/analytics/student/{student_id}/month/{year}/{month}")
async def get_student_monthly_analytics(student_id: str, year: int, month: int):
    """Get analytics for a specific month"""
    start_date = datetime(year, month, 1)
    _, last_day = calendar.monthrange(year, month)
    end_date = datetime(year, month, last_day, 23, 59, 59)
    
    logs = await db.zone_logs.find({
        "student_id": student_id,
        "timestamp": {"$gte": start_date, "$lte": end_date}
    }).sort("timestamp", 1).to_list(10000)
    
    zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    strategy_counts = {}
    daily_data = {}
    detailed_logs = []
    
    for log in logs:
        zone = log.get("zone", "")
        if zone in zone_counts:
            zone_counts[zone] += 1
        
        for strategy in log.get("strategies_selected", []):
            strategy_counts[strategy] = strategy_counts.get(strategy, 0) + 1
        
        day = log["timestamp"].strftime("%Y-%m-%d")
        if day not in daily_data:
            daily_data[day] = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
        if zone in daily_data[day]:
            daily_data[day][zone] += 1
        
        detailed_logs.append({
            "date": log["timestamp"].strftime("%Y-%m-%d"),
            "time": log["timestamp"].strftime("%H:%M"),
            "zone": zone,
            "strategies": log.get("strategies_selected", [])
        })
    
    return {
        "zone_counts": zone_counts,
        "total_logs": len(logs),
        "strategy_counts": strategy_counts,
        "daily_data": daily_data,
        "detailed_logs": detailed_logs,
        "month": month,
        "year": year
    }

# ---- PDF Report Generation ----
def create_zone_chart(zone_counts):
    """Create a bar chart for zone distribution"""
    drawing = Drawing(400, 200)
    
    chart = VerticalBarChart()
    chart.x = 50
    chart.y = 50
    chart.height = 125
    chart.width = 300
    
    data = [[zone_counts.get("blue", 0), zone_counts.get("green", 0), 
             zone_counts.get("yellow", 0), zone_counts.get("red", 0)]]
    chart.data = data
    
    chart.categoryAxis.categoryNames = ['Blue', 'Green', 'Yellow', 'Red']
    chart.categoryAxis.labels.boxAnchor = 'n'
    
    chart.bars[0].fillColor = colors.HexColor('#4A90D9')
    chart.bars.strokeColor = None
    
    # Set individual bar colors
    for i, color_hex in enumerate(['#4A90D9', '#4CAF50', '#FFC107', '#F44336']):
        chart.bars[0].fillColor = colors.HexColor(color_hex)
    
    drawing.add(chart)
    return drawing

@api_router.get("/reports/pdf/student/{student_id}/month/{year}/{month}")
async def generate_student_monthly_pdf(student_id: str, year: int, month: int):
    """Generate PDF report for a student's monthly data"""
    # Get student info
    student = await db.students.find_one({"id": student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Get monthly data
    start_date = datetime(year, month, 1)
    _, last_day = calendar.monthrange(year, month)
    end_date = datetime(year, month, last_day, 23, 59, 59)
    
    logs = await db.zone_logs.find({
        "student_id": student_id,
        "timestamp": {"$gte": start_date, "$lte": end_date}
    }).sort("timestamp", 1).to_list(10000)
    
    # Calculate stats
    zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    strategy_counts = {}
    
    for log in logs:
        zone = log.get("zone", "")
        if zone in zone_counts:
            zone_counts[zone] += 1
        for strategy in log.get("strategies_selected", []):
            strategy_counts[strategy] = strategy_counts.get(strategy, 0) + 1
    
    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    elements = []
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=20,
        alignment=1  # Center
    )
    month_name = calendar.month_name[month]
    elements.append(Paragraph(f"Zones of Regulation Report", title_style))
    elements.append(Paragraph(f"{student['name']} - {month_name} {year}", styles['Heading2']))
    elements.append(Spacer(1, 20))
    
    # Summary stats
    elements.append(Paragraph("Summary", styles['Heading3']))
    summary_data = [
        ['Total Check-ins', str(len(logs))],
        ['Blue Zone', str(zone_counts['blue'])],
        ['Green Zone', str(zone_counts['green'])],
        ['Yellow Zone', str(zone_counts['yellow'])],
        ['Red Zone', str(zone_counts['red'])],
    ]
    
    summary_table = Table(summary_data, colWidths=[200, 100])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#5C6BC0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F5F5F5')),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E0E0E0')),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))
    
    # Detailed logs
    if logs:
        elements.append(Paragraph("Detailed Check-ins", styles['Heading3']))
        log_data = [['Date', 'Time', 'Zone', 'Strategies Used']]
        
        for log in logs:
            strategies = ", ".join(log.get("strategies_selected", [])) or "None"
            log_data.append([
                log["timestamp"].strftime("%Y-%m-%d"),
                log["timestamp"].strftime("%H:%M"),
                log.get("zone", "").capitalize(),
                strategies[:30] + "..." if len(strategies) > 30 else strategies
            ])
        
        log_table = Table(log_data, colWidths=[80, 60, 70, 180])
        log_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#5C6BC0')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E0E0E0')),
            ('PADDING', (0, 0), (-1, -1), 6),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9F9F9')]),
        ]))
        elements.append(log_table)
    
    # Top strategies
    if strategy_counts:
        elements.append(Spacer(1, 20))
        elements.append(Paragraph("Most Used Strategies", styles['Heading3']))
        sorted_strategies = sorted(strategy_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        strat_data = [['Strategy', 'Times Used']]
        for strat, count in sorted_strategies:
            strat_data.append([strat, str(count)])
        
        strat_table = Table(strat_data, colWidths=[250, 80])
        strat_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#FFC107')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E0E0E0')),
            ('PADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(strat_table)
    
    # Footer
    elements.append(Spacer(1, 30))
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=10, textColor=colors.gray)
    elements.append(Paragraph(f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M')}", footer_style))
    elements.append(Paragraph("Class of Happiness - Zones of Regulation", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"{student['name'].replace(' ', '_')}_{month_name}_{year}_report.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
