from fastapi import FastAPI, APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
import os
import logging
import httpx
import io
import calendar
from datetime import datetime, timedelta, timezone
from pathlib import Path

# PDF Generation
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.charts.barcharts import VerticalBarChart

# Supabase
from supabase import create_client, Client

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Supabase client
SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

app = FastAPI(title="Class of Happiness API")
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================== SUBSCRIPTION PLANS ==================
SUBSCRIPTION_PLANS = {
    "monthly": {"price": 4.99, "name": "Monthly", "duration_days": 30},
    "six_month": {"price": 19.99, "name": "6 Months", "duration_days": 180},
    "annual": {"price": 35.00, "name": "Annual", "duration_days": 365}
}
TRIAL_DURATION_DAYS = 7

# Promo codes
PROMO_CODES = {
    "HAPPYCLASS2026": {"type": "trial", "days": 30},
    "CLASSOFHAPPINESS2026": {"type": "trial", "days": 30},
    "ADMINCLASS2026": {"type": "admin"},
    "HAPPYADMIN2026": {"type": "admin"},
}

# ================== FEELINGS / COLOURS ==================
# Internal code still uses 'blue/green/yellow/red' for DB compatibility
# but all user-facing text says "feelings" not "zones"
FEELING_COLOURS = ["blue", "green", "yellow", "red"]

FEELING_COLOUR_MAP = {
    "blue": "aqua_buddy",
    "green": "leaf_friend",
    "yellow": "spark_pal",
    "red": "blaze_heart"
}

POINTS_CONFIG = {
    "strategy_used": 8,
    "comment_added": 12,
    "daily_streak_bonus": 5,
    "checkin": 5,
    "evolution_thresholds": [0, 25, 60, 120]
}

# ================== CREATURES ==================
CREATURES = [
    {
        "id": "aqua_buddy",
        "name": "Aqua Buddy",
        "feeling_colour": "blue",
        "emoji_stages": ["🥚", "🐣", "🐧", "🦋"],
        "stages": [
            {"stage": 0, "name": "Egg", "emoji": "🥚", "description": "A mysterious egg...", "required_points": 0},
            {"stage": 1, "name": "Hatchling", "emoji": "🐣", "description": "A curious hatchling!", "required_points": 25},
            {"stage": 2, "name": "Penguin", "emoji": "🐧", "description": "A cool penguin friend!", "required_points": 60},
            {"stage": 3, "name": "Butterfly", "emoji": "🦋", "description": "A beautiful butterfly!", "required_points": 120}
        ]
    },
    {
        "id": "leaf_friend",
        "name": "Leaf Friend",
        "feeling_colour": "green",
        "emoji_stages": ["🥚", "🌱", "🌿", "🌳"],
        "stages": [
            {"stage": 0, "name": "Seed", "emoji": "🥚", "description": "A tiny seed...", "required_points": 0},
            {"stage": 1, "name": "Sprout", "emoji": "🌱", "description": "A tiny sprout!", "required_points": 25},
            {"stage": 2, "name": "Plant", "emoji": "🌿", "description": "A healthy plant!", "required_points": 60},
            {"stage": 3, "name": "Tree", "emoji": "🌳", "description": "A magnificent tree!", "required_points": 120}
        ]
    },
    {
        "id": "spark_pal",
        "name": "Spark Pal",
        "feeling_colour": "yellow",
        "emoji_stages": ["🥚", "⭐", "🌟", "✨"],
        "stages": [
            {"stage": 0, "name": "Spark", "emoji": "🥚", "description": "A tiny spark...", "required_points": 0},
            {"stage": 1, "name": "Star", "emoji": "⭐", "description": "A bright star!", "required_points": 25},
            {"stage": 2, "name": "Glow", "emoji": "🌟", "description": "A glowing star!", "required_points": 60},
            {"stage": 3, "name": "Shimmer", "emoji": "✨", "description": "A dazzling shimmer!", "required_points": 120}
        ]
    },
    {
        "id": "blaze_heart",
        "name": "Blaze Heart",
        "feeling_colour": "red",
        "emoji_stages": ["🥚", "🔥", "🦊", "🐉"],
        "stages": [
            {"stage": 0, "name": "Ember", "emoji": "🥚", "description": "A warm ember...", "required_points": 0},
            {"stage": 1, "name": "Flame", "emoji": "🔥", "description": "A brave flame!", "required_points": 25},
            {"stage": 2, "name": "Fox", "emoji": "🦊", "description": "A clever fox!", "required_points": 60},
            {"stage": 3, "name": "Dragon", "emoji": "🐉", "description": "A mighty dragon!", "required_points": 120}
        ]
    }
]

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

# ================== DEFAULT STRATEGIES ==================
# NOTE: All user-facing text uses "helpers" not "strategies" where possible
# Colour names kept for internal use only
DEFAULT_HELPERS = {
    "blue": [
        {"id": "blue_1", "name": "Gentle Stretch", "description": "Slowly stretch your arms and legs", "icon": "accessibility", "feeling_colour": "blue"},
        {"id": "blue_2", "name": "Warm Drink", "description": "Have a warm drink of water", "icon": "local-cafe", "feeling_colour": "blue"},
        {"id": "blue_3", "name": "Favourite Song", "description": "Listen to your favourite song", "icon": "music-note", "feeling_colour": "blue"},
        {"id": "blue_4", "name": "Cosy Spot", "description": "Find a comfortable, cosy spot", "icon": "weekend", "feeling_colour": "blue"},
        {"id": "blue_5", "name": "Tell Someone", "description": "Tell a trusted person how you feel", "icon": "chat", "feeling_colour": "blue"},
        {"id": "blue_6", "name": "Slow Breathing", "description": "Take 3 slow, deep breaths", "icon": "air", "feeling_colour": "blue"},
    ],
    "green": [
        {"id": "green_1", "name": "Keep Going!", "description": "You are doing great - keep it up!", "icon": "star", "feeling_colour": "green"},
        {"id": "green_2", "name": "Help a Friend", "description": "Offer to help someone nearby", "icon": "people", "feeling_colour": "green"},
        {"id": "green_3", "name": "Try Something New", "description": "This is a great time to learn", "icon": "lightbulb", "feeling_colour": "green"},
        {"id": "green_4", "name": "Share Your Smile", "description": "Smile at someone around you", "icon": "sentiment-satisfied", "feeling_colour": "green"},
        {"id": "green_5", "name": "Set a Goal", "description": "Think of something you want to do today", "icon": "flag", "feeling_colour": "green"},
        {"id": "green_6", "name": "Gratitude", "description": "Think of one thing you are grateful for", "icon": "favorite", "feeling_colour": "green"},
    ],
    "yellow": [
        {"id": "yellow_1", "name": "Bubble Breathing", "description": "Breathe in slowly, breathe out like blowing bubbles", "icon": "bubble-chart", "feeling_colour": "yellow"},
        {"id": "yellow_2", "name": "Body Shake", "description": "Shake out the wiggles from your body", "icon": "directions-run", "feeling_colour": "yellow"},
        {"id": "yellow_3", "name": "Count to 10", "description": "Count slowly from 1 to 10", "icon": "format-list-numbered", "feeling_colour": "yellow"},
        {"id": "yellow_4", "name": "5 Senses", "description": "Name 5 things you can see around you", "icon": "visibility", "feeling_colour": "yellow"},
        {"id": "yellow_5", "name": "Squeeze & Release", "description": "Squeeze your hands tight then let go", "icon": "pan-tool", "feeling_colour": "yellow"},
        {"id": "yellow_6", "name": "Talk About It", "description": "Tell a trusted adult how you are feeling", "icon": "record-voice-over", "feeling_colour": "yellow"},
    ],
    "red": [
        {"id": "red_1", "name": "Freeze", "description": "Stop and freeze your body completely", "icon": "pause-circle-filled", "feeling_colour": "red"},
        {"id": "red_2", "name": "Big Breaths", "description": "Take 5 very slow, deep breaths", "icon": "air", "feeling_colour": "red"},
        {"id": "red_3", "name": "Count Backwards", "description": "Count slowly from 10 down to 1", "icon": "exposure-neg-1", "feeling_colour": "red"},
        {"id": "red_4", "name": "Safe Space", "description": "Go to your calm corner", "icon": "king-bed", "feeling_colour": "red"},
        {"id": "red_5", "name": "Ask for Help", "description": "Tell a trusted adult you need support", "icon": "support-agent", "feeling_colour": "red"},
        {"id": "red_6", "name": "Self Hug", "description": "Give yourself a big, warm hug", "icon": "favorite-border", "feeling_colour": "red"},
    ]
}

# ================== TRANSLATIONS ==================
TRANSLATIONS = {
    "en": {
        # App general
        "app_name": "Class of Happiness",
        "how_are_you_feeling": "How are you feeling?",
        "tap_colour_help": "Tap the colour that matches how you feel",
        "choose_helpers": "Choose your helpers",
        "want_to_say": "Want to say something?",
        "write_sentence": "Write one sentence about how you feel...",
        "save_checkin": "Save My Feelings",
        "well_done": "Well Done!",
        "great_job": "Great job sharing your feelings!",
        # Feeling colours (NOT zones)
        "blue_feelings": "Blue Feelings",
        "green_feelings": "Green Feelings",
        "yellow_feelings": "Yellow Feelings",
        "red_feelings": "Red Feelings",
        "blue_feeling": "Quiet Energy",
        "green_feeling": "Balanced Energy",
        "yellow_feeling": "Fizzing Energy",
        "red_feeling": "Big Energy",
        "blue_description": "Your body is moving slowly. You might feel tired, a bit sad, or need some rest.",
        "green_description": "You feel calm, happy and ready. This is a great feeling!",
        "yellow_description": "You are starting to feel wobbly. You might feel silly, worried or frustrated.",
        "red_description": "Your body has big feelings right now. You might feel very upset or out of control.",
        # Dashboard
        "how_i_feel": "How I Feel",
        "my_helpers": "My Helpers",
        "my_creatures": "My Creatures",
        "feeling_chart": "Feelings Chart",
        "feelings_today": "Feelings Today",
        "recent_feelings": "Recent Feelings",
        # Teacher
        "class_dashboard": "Class Dashboard",
        "my_students": "My Students",
        "my_classrooms": "My Classrooms",
        "student_feelings": "Student Feelings",
        "feeling_patterns": "Feeling Patterns",
        "download_report": "Download Report",
        "generate_parent_code": "Generate Parent Code",
        "all_students": "All Students",
        "filter_by_classroom": "Filter by Classroom",
        "no_recent_checkins": "No recent check-ins",
        "search_students": "Search students...",
        "add_new_student": "Add New Student",
        "no_students_yet": "No students yet",
        "add_first_student": "Add your first student to get started",
        "no_students_found": "No students found",
        "try_different_search": "Try a different search",
        "delete_student": "Delete Student",
        "delete_student_confirm": "Are you sure you want to delete this student?",
        "days_7": "7 Days",
        "days_14": "2 Weeks",
        "days_30": "30 Days",
        # Parent
        "family_dashboard": "Family Dashboard",
        "home_check_in": "Home Check-In",
        "link_school_child": "Link School Child",
        "family_helpers": "Family Helpers",
        "share_with_teacher": "Share with Teacher",
        # Profiles
        "no_profiles_yet": "No profiles yet!",
        "create_first_profile": "Create your first profile to get started",
        # Helpers (strategies)
        "loading_helpers": "Loading helpers...",
        "green_helper_text": "Great! Here are ways to stay feeling good:",
        "other_helper_text": "Here are some helpers that might help:",
        "tap_helpers_green": "Tap any helpers you would like to try:",
        "tap_helpers_other": "Tap to select helpers that might help:",
        # Creatures / rewards
        "great_job_title": "Amazing Work!",
        "keep_it_up": "Keep it up!",
        "streak_bonus": "streak bonus!",
        "day_streak": "days in a row!",
        "points": "Points",
        "continue": "Continue",
        "loading_creature": "Loading your creature...",
        "more_points_until": "more points until",
        "evolves": "evolves!",
        "collected": "Collected",
        "current_friend": "Current Friend",
        "fully_evolved": "Fully Evolved",
        "keep_growing": "Keep Growing!",
        "grow_creature_hint": "Use helpers and share your feelings to evolve your creature!",
        "complete": "Complete!",
        "evolved": "EVOLVED!",
        "evolving": "EVOLVING...",
        "amazing_continue": "Amazing! Continue",
        # Classrooms
        "create_new_classroom": "Create New Classroom",
        "classroom_name": "Classroom Name",
        "teacher_name_optional": "Teacher Name (Optional)",
        "create_classroom": "Create Classroom",
        "creating": "Creating...",
        "no_classrooms_yet": "No classrooms yet",
        "create_classroom_organize": "Create a classroom to organise your students",
        "no_classroom": "No Classroom",
        # Resources
        "loading_resources": "Loading resources...",
        "no_resources_yet": "No resources yet",
        "be_first_upload": "Be the first to upload a resource!",
        # Parent link
        "share_with_parent": "Share with Parent",
        "generate_code": "Generate Code",
        "generating": "Generating...",
        "parent_link_code": "Parent Link Code:",
        "code_expires_7_days": "This code expires in 7 days.",
        "share_code": "Share Code",
        # Auth
        "sign_in": "Sign In",
        "sign_out": "Sign Out",
        "sign_in_google": "Sign in with Google",
        "welcome_back": "Welcome back!",
        # Subscription
        "free_trial": "Free Trial",
        "subscribe": "Subscribe",
        "trial_days_left": "trial days left",
        # Misc
        "loading": "Loading...",
        "save": "Save",
        "cancel": "Cancel",
        "delete": "Delete",
        "edit": "Edit",
        "back": "Back",
        "next": "Next",
        "done": "Done",
        "error": "Something went wrong",
        "try_again": "Try Again",
        "no_data": "No data yet",
        "settings": "Settings",
        "language": "Language",
        "about": "About",
    },
    "es": {
        "app_name": "Clase de Felicidad",
        "how_are_you_feeling": "¿Cómo te sientes?",
        "tap_colour_help": "Toca el color que coincide con cómo te sientes",
        "choose_helpers": "Elige tus ayudantes",
        "want_to_say": "¿Quieres decir algo?",
        "write_sentence": "Escribe una oración sobre cómo te sientes...",
        "save_checkin": "Guardar mis sentimientos",
        "well_done": "¡Bien hecho!",
        "great_job": "¡Buen trabajo compartiendo tus sentimientos!",
        "blue_feelings": "Sentimientos Azules",
        "green_feelings": "Sentimientos Verdes",
        "yellow_feelings": "Sentimientos Amarillos",
        "red_feelings": "Sentimientos Rojos",
        "blue_feeling": "Energía Tranquila",
        "green_feeling": "Energía Equilibrada",
        "yellow_feeling": "Energía Burbujeante",
        "red_feeling": "Energía Grande",
        "blue_description": "Tu cuerpo se mueve lentamente. Puedes sentirte cansado o necesitar descanso.",
        "green_description": "Te sientes tranquilo, feliz y listo. ¡Este es un gran sentimiento!",
        "yellow_description": "Empiezas a sentirte inestable. Puedes sentirte tonto, preocupado o frustrado.",
        "red_description": "Tu cuerpo tiene grandes sentimientos ahora mismo.",
        "how_i_feel": "Cómo Me Siento",
        "my_helpers": "Mis Ayudantes",
        "my_creatures": "Mis Criaturas",
        "feeling_chart": "Gráfico de Sentimientos",
        "all_students": "Todos los Estudiantes",
        "filter_by_classroom": "Filtrar por Clase",
        "no_profiles_yet": "¡Sin perfiles aún!",
        "create_first_profile": "Crea tu primer perfil para empezar",
        "loading": "Cargando...",
        "save": "Guardar",
        "cancel": "Cancelar",
        "delete": "Eliminar",
        "edit": "Editar",
        "back": "Atrás",
        "next": "Siguiente",
        "done": "Hecho",
        "continue": "Continuar",
        "points": "Puntos",
        "my_creatures": "Mis Criaturas",
        "great_job_title": "¡Trabajo Increíble!",
    },
    "fr": {
        "app_name": "Classe du Bonheur",
        "how_are_you_feeling": "Comment te sens-tu?",
        "tap_colour_help": "Appuie sur la couleur qui correspond à ton ressenti",
        "choose_helpers": "Choisis tes aides",
        "blue_feelings": "Sentiments Bleus",
        "green_feelings": "Sentiments Verts",
        "yellow_feelings": "Sentiments Jaunes",
        "red_feelings": "Sentiments Rouges",
        "blue_feeling": "Énergie Calme",
        "green_feeling": "Énergie Équilibrée",
        "yellow_feeling": "Énergie Pétillante",
        "red_feeling": "Grande Énergie",
        "how_i_feel": "Comment Je Me Sens",
        "my_helpers": "Mes Aides",
        "my_creatures": "Mes Créatures",
        "all_students": "Tous les Élèves",
        "filter_by_classroom": "Filtrer par Classe",
        "no_profiles_yet": "Pas encore de profils!",
        "create_first_profile": "Créez votre premier profil pour commencer",
        "loading": "Chargement...",
        "save": "Sauvegarder",
        "cancel": "Annuler",
        "continue": "Continuer",
        "points": "Points",
        "great_job_title": "Travail Incroyable!",
    },
    "de": {
        "app_name": "Klasse des Glücks",
        "how_are_you_feeling": "Wie fühlst du dich?",
        "tap_colour_help": "Tippe auf die Farbe, die deinem Gefühl entspricht",
        "choose_helpers": "Wähle deine Helfer",
        "blue_feelings": "Blaue Gefühle",
        "green_feelings": "Grüne Gefühle",
        "yellow_feelings": "Gelbe Gefühle",
        "red_feelings": "Rote Gefühle",
        "blue_feeling": "Ruhige Energie",
        "green_feeling": "Ausgeglichene Energie",
        "yellow_feeling": "Kribbelnde Energie",
        "red_feeling": "Große Energie",
        "how_i_feel": "Wie ich mich fühle",
        "my_helpers": "Meine Helfer",
        "my_creatures": "Meine Kreaturen",
        "all_students": "Alle Schüler",
        "filter_by_classroom": "Nach Klasse filtern",
        "no_profiles_yet": "Noch keine Profile!",
        "create_first_profile": "Erstelle dein erstes Profil",
        "loading": "Laden...",
        "save": "Speichern",
        "cancel": "Abbrechen",
        "continue": "Weiter",
        "points": "Punkte",
        "great_job_title": "Großartige Arbeit!",
    },
    "pt": {
        "app_name": "Classe da Felicidade",
        "how_are_you_feeling": "Como você está se sentindo?",
        "tap_colour_help": "Toque na cor que corresponde ao seu sentimento",
        "choose_helpers": "Escolha seus ajudantes",
        "blue_feelings": "Sentimentos Azuis",
        "green_feelings": "Sentimentos Verdes",
        "yellow_feelings": "Sentimentos Amarelos",
        "red_feelings": "Sentimentos Vermelhos",
        "blue_feeling": "Energia Calma",
        "green_feeling": "Energia Equilibrada",
        "yellow_feeling": "Energia Borbulhante",
        "red_feeling": "Grande Energia",
        "how_i_feel": "Como Me Sinto",
        "my_helpers": "Meus Ajudantes",
        "my_creatures": "Minhas Criaturas",
        "all_students": "Todos os Alunos",
        "filter_by_classroom": "Filtrar por Turma",
        "no_profiles_yet": "Ainda sem perfis!",
        "create_first_profile": "Crie seu primeiro perfil para começar",
        "loading": "Carregando...",
        "save": "Salvar",
        "cancel": "Cancelar",
        "continue": "Continuar",
        "points": "Pontos",
        "great_job_title": "Trabalho Incrível!",
    }
}

# ================== MODELS ==================
class UserCreate(BaseModel):
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "teacher"

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

class ClassroomCreate(BaseModel):
    name: str
    teacher_name: Optional[str] = None

class FeelingLogCreate(BaseModel):
    student_id: str
    feeling_colour: str  # blue/green/yellow/red
    helpers_selected: List[str] = []
    comment: Optional[str] = None
    location: str = "school"

class AddPointsRequest(BaseModel):
    points_type: str = "checkin"
    strategy_count: int = 0
    feeling_colour: Optional[str] = "blue"

class ResourceCreate(BaseModel):
    title: str
    description: str
    content_type: str = "text"
    content: Optional[str] = None
    pdf_filename: Optional[str] = None
    category: str = "general"
    is_global: bool = False

class CustomHelperCreate(BaseModel):
    student_id: Optional[str] = None
    name: str
    description: str
    feeling_colour: str
    icon: str = "star"
    custom_image: Optional[str] = None
    is_shared: bool = False

class FamilyMemberCreate(BaseModel):
    name: str
    relationship: str = "child"
    avatar_type: str = "preset"
    avatar_preset: Optional[str] = "cat"
    avatar_custom: Optional[str] = None

class LinkChildRequest(BaseModel):
    link_code: str

class PromoCodeRequest(BaseModel):
    code: str

# ================== AUTH HELPERS ==================
async def get_current_user(request: Request) -> Optional[dict]:
    """Get current user from Supabase session token"""
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    if not session_token:
        return None
    try:
        result = supabase.table("user_sessions").select("*").eq("session_token", session_token).execute()
        if not result.data:
            return None
        session = result.data[0]
        expires_at = datetime.fromisoformat(session["expires_at"].replace("Z", "+00:00"))
        if expires_at < datetime.now(timezone.utc):
            return None
        user_result = supabase.table("users").select("*").eq("user_id", session["user_id"]).execute()
        if not user_result.data:
            return None
        return user_result.data[0]
    except Exception as e:
        logger.error(f"Auth error: {e}")
        return None

def check_subscription_active(user: dict) -> bool:
    if user.get("role") == "admin":
        return True
    sub_status = user.get("subscription_status", "none")
    if sub_status == "active":
        exp = user.get("subscription_expires_at")
        if exp:
            exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            return exp_dt > datetime.now(timezone.utc)
    if sub_status == "trial":
        trial_start = user.get("trial_started_at")
        if trial_start:
            start_dt = datetime.fromisoformat(trial_start.replace("Z", "+00:00"))
            return datetime.now(timezone.utc) < start_dt + timedelta(days=TRIAL_DURATION_DAYS)
    promo_end = user.get("promo_trial_ends_at")
    if promo_end:
        end_dt = datetime.fromisoformat(promo_end.replace("Z", "+00:00"))
        return end_dt > datetime.now(timezone.utc)
    return False

# ================== HEALTH ==================
@api_router.get("/health")
async def health():
    return {"status": "healthy", "app": "Class of Happiness", "version": "2.0"}

# ================== TRANSLATIONS ==================
@api_router.get("/translations/{lang}")
async def get_translations(lang: str):
    translations = TRANSLATIONS.get(lang, TRANSLATIONS["en"])
    # Always fill missing keys from English
    result = {**TRANSLATIONS["en"], **translations}
    return result

# ================== AVATARS ==================
@api_router.get("/avatars")
async def get_avatars():
    return PRESET_AVATARS

# ================== AUTH ==================
@api_router.post("/auth/google")
async def google_auth(request: Request):
    """Authenticate with Google OAuth token"""
    try:
        body = await request.json()
        google_token = body.get("token")
        if not google_token:
            raise HTTPException(status_code=400, detail="No token provided")

        # Verify with Google
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {google_token}"}
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid Google token")
            google_user = resp.json()

        email = google_user.get("email")
        name = google_user.get("name", email)
        picture = google_user.get("picture")

        # Upsert user
        existing = supabase.table("users").select("*").eq("email", email).execute()
        if existing.data:
            user = existing.data[0]
            supabase.table("users").update({"name": name, "picture": picture}).eq("email", email).execute()
        else:
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            new_user = {
                "user_id": user_id,
                "email": email,
                "name": name,
                "picture": picture,
                "role": "teacher",
                "language": "en",
                "subscription_status": "none",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            supabase.table("users").insert(new_user).execute()
            user = new_user

        # Create session
        session_token = str(uuid.uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(days=30)
        supabase.table("user_sessions").insert({
            "session_token": session_token,
            "user_id": user["user_id"],
            "expires_at": expires_at.isoformat()
        }).execute()

        response = Response(content=str({"user": user, "session_token": session_token}))
        response.set_cookie("session_token", session_token, httponly=True, max_age=30*24*3600, samesite="none", secure=True)
        return {"user": user, "session_token": session_token}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google auth error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

@api_router.post("/auth/logout")
async def logout(request: Request):
    session_token = request.cookies.get("session_token")
    if session_token:
        supabase.table("user_sessions").delete().eq("session_token", session_token).execute()
    response = Response(content='{"message": "Logged out"}')
    response.delete_cookie("session_token")
    return {"message": "Logged out"}

@api_router.put("/auth/role")
async def update_role(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    role = body.get("role")
    if role not in ["teacher", "parent"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    supabase.table("users").update({"role": role}).eq("user_id", user["user_id"]).execute()
    return {"role": role}

@api_router.post("/auth/promote-admin")
async def promote_admin(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    code = body.get("admin_code", "")
    if code not in ["ADMINCLASS2026", "HAPPYADMIN2026"]:
        raise HTTPException(status_code=403, detail="Invalid admin code")
    supabase.table("users").update({"role": "admin"}).eq("user_id", user["user_id"]).execute()
    return {"message": "Promoted to admin", "role": "admin"}

@api_router.post("/auth/promo-code")
async def apply_promo_code(request: Request, body: PromoCodeRequest):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    code = body.code.upper().strip()
    promo = PROMO_CODES.get(code)
    if not promo:
        raise HTTPException(status_code=400, detail="Invalid promo code")
    if promo["type"] == "admin":
        supabase.table("users").update({"role": "admin"}).eq("user_id", user["user_id"]).execute()
        return {"message": "Admin access granted!"}
    days = promo.get("days", 30)
    ends_at = datetime.now(timezone.utc) + timedelta(days=days)
    supabase.table("users").update({
        "subscription_status": "trial",
        "promo_trial_ends_at": ends_at.isoformat(),
        "trial_started_at": datetime.now(timezone.utc).isoformat()
    }).eq("user_id", user["user_id"]).execute()
    return {"message": f"Trial activated for {days} days!", "ends_at": ends_at.isoformat()}

# ================== STUDENTS ==================
@api_router.get("/students")
async def get_students(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = supabase.table("students").select("*").eq("user_id", user["user_id"]).execute()
    return result.data or []

@api_router.post("/students")
async def create_student(student: StudentCreate, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    new_student = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "name": student.name,
        "avatar_type": student.avatar_type,
        "avatar_preset": student.avatar_preset,
        "avatar_custom": student.avatar_custom,
        "classroom_id": student.classroom_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = supabase.table("students").insert(new_student).execute()
    return result.data[0] if result.data else new_student

@api_router.get("/students/{student_id}")
async def get_student(student_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = supabase.table("students").select("*").eq("id", student_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Student not found")
    return result.data[0]

@api_router.put("/students/{student_id}")
async def update_student(student_id: str, update: StudentUpdate, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    supabase.table("students").update(update_data).eq("id", student_id).execute()
    result = supabase.table("students").select("*").eq("id", student_id).execute()
    return result.data[0] if result.data else {}

@api_router.delete("/students/{student_id}")
async def delete_student(student_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    supabase.table("feeling_logs").delete().eq("student_id", student_id).execute()
    supabase.table("student_rewards").delete().eq("student_id", student_id).execute()
    supabase.table("students").delete().eq("id", student_id).execute()
    return {"message": "Student deleted"}

@api_router.post("/students/{student_id}/generate-link-code")
async def generate_link_code(student_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if user.get("role") not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Teachers only")
    link_code = str(uuid.uuid4())[:6].upper()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    supabase.table("students").update({
        "link_code": link_code,
        "link_code_expires_at": expires_at.isoformat()
    }).eq("id", student_id).execute()
    return {"link_code": link_code, "expires_at": expires_at.isoformat()}

# ================== CLASSROOMS ==================
@api_router.get("/classrooms")
async def get_classrooms(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = supabase.table("classrooms").select("*").eq("user_id", user["user_id"]).execute()
    return result.data or []

@api_router.post("/classrooms")
async def create_classroom(classroom: ClassroomCreate, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    new_classroom = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "name": classroom.name,
        "teacher_name": classroom.teacher_name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = supabase.table("classrooms").insert(new_classroom).execute()
    return result.data[0] if result.data else new_classroom

@api_router.delete("/classrooms/{classroom_id}")
async def delete_classroom(classroom_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    supabase.table("classrooms").delete().eq("id", classroom_id).execute()
    return {"message": "Classroom deleted"}

# ================== FEELING LOGS (was zone_logs) ==================
@api_router.post("/feeling-logs")
async def create_feeling_log(log: FeelingLogCreate, request: Request):
    new_log = {
        "id": str(uuid.uuid4()),
        "student_id": log.student_id,
        "feeling_colour": log.feeling_colour,
        "helpers_selected": log.helpers_selected,
        "comment": log.comment,
        "location": log.location,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    result = supabase.table("feeling_logs").insert(new_log).execute()
    return result.data[0] if result.data else new_log

# Keep old endpoint name for frontend compatibility
@api_router.post("/zone-logs")
async def create_zone_log(log: FeelingLogCreate, request: Request):
    return await create_feeling_log(log, request)

@api_router.get("/feeling-logs/{student_id}")
async def get_feeling_logs(student_id: str, days: int = 7):
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    result = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start_date).order("timestamp", desc=True).execute()
    return result.data or []

# Keep old endpoint name for frontend compatibility
@api_router.get("/zone-logs/{student_id}")
async def get_zone_logs(student_id: str, days: int = 7):
    return await get_feeling_logs(student_id, days)

# ================== HELPERS / STRATEGIES ==================
@api_router.get("/helpers")
async def get_helpers(feeling_colour: Optional[str] = None, student_id: Optional[str] = None, lang: str = "en"):
    helpers = []
    colours = [feeling_colour] if feeling_colour else FEELING_COLOURS
    for colour in colours:
        helpers.extend(DEFAULT_HELPERS.get(colour, []))

    # Get custom helpers for this student
    if student_id:
        try:
            custom = supabase.table("custom_helpers").select("*").eq("student_id", student_id).eq("is_active", True).execute()
            if custom.data:
                for h in custom.data:
                    if not feeling_colour or h.get("feeling_colour") == feeling_colour:
                        helpers.append(h)
        except Exception as e:
            logger.error(f"Error fetching custom helpers: {e}")

    return helpers

# Keep old endpoint name for frontend compatibility
@api_router.get("/strategies")
async def get_strategies(zone: Optional[str] = None, student_id: Optional[str] = None, lang: str = "en"):
    return await get_helpers(feeling_colour=zone, student_id=student_id, lang=lang)

@api_router.post("/helpers/custom")
async def create_custom_helper(helper: CustomHelperCreate, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    new_helper = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "student_id": helper.student_id,
        "name": helper.name,
        "description": helper.description,
        "feeling_colour": helper.feeling_colour,
        "icon": helper.icon,
        "custom_image": helper.custom_image,
        "is_shared": helper.is_shared,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = supabase.table("custom_helpers").insert(new_helper).execute()
    return result.data[0] if result.data else new_helper

# ================== CREATURES / REWARDS ==================
@api_router.get("/creatures")
async def get_creatures():
    return CREATURES

@api_router.get("/rewards/{student_id}")
async def get_rewards(student_id: str):
    result = supabase.table("student_rewards").select("*").eq("student_id", student_id).execute()
    if result.data:
        return result.data[0]
    # Init default rewards
    default = {
        "student_id": student_id,
        "total_points_earned": 0,
        "streak_days": 0,
        "last_checkin_date": None,
        "creature_points": {"aqua_buddy": 0, "leaf_friend": 0, "spark_pal": 0, "blaze_heart": 0},
        "creature_stages": {"aqua_buddy": 0, "leaf_friend": 0, "spark_pal": 0, "blaze_heart": 0},
        "collected_creatures": [],
        "current_creature_id": "aqua_buddy",
        "current_stage": 0,
        "current_points": 0
    }
    supabase.table("student_rewards").insert(default).execute()
    return default

@api_router.post("/rewards/{student_id}/add-points")
async def add_points(student_id: str, req: AddPointsRequest):
    rewards_result = supabase.table("student_rewards").select("*").eq("student_id", student_id).execute()

    if rewards_result.data:
        rewards = rewards_result.data[0]
    else:
        rewards = {
            "student_id": student_id,
            "total_points_earned": 0,
            "streak_days": 0,
            "last_checkin_date": None,
            "creature_points": {"aqua_buddy": 0, "leaf_friend": 0, "spark_pal": 0, "blaze_heart": 0},
            "creature_stages": {"aqua_buddy": 0, "leaf_friend": 0, "spark_pal": 0, "blaze_heart": 0},
            "collected_creatures": [],
            "current_creature_id": "aqua_buddy",
            "current_stage": 0,
            "current_points": 0
        }

    # Which creature gets the points
    feeling_colour = req.feeling_colour or "blue"
    target_creature = FEELING_COLOUR_MAP.get(feeling_colour, "aqua_buddy")

    # Calculate points
    points_to_add = 0
    if req.points_type == "strategy":
        points_to_add = POINTS_CONFIG["strategy_used"] * req.strategy_count
    elif req.points_type == "comment":
        points_to_add = POINTS_CONFIG["comment_added"]
    elif req.points_type == "checkin":
        points_to_add = POINTS_CONFIG["checkin"]

    # Streak calculation
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    last_checkin = rewards.get("last_checkin_date")
    streak_days = rewards.get("streak_days", 0)
    if req.points_type == "checkin":
        if last_checkin:
            yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
            if last_checkin == yesterday:
                streak_days += 1
                points_to_add += POINTS_CONFIG["daily_streak_bonus"]
            elif last_checkin != today:
                streak_days = 1
        else:
            streak_days = 1

    # Update creature points
    creature_points = rewards.get("creature_points") or {"aqua_buddy": 0, "leaf_friend": 0, "spark_pal": 0, "blaze_heart": 0}
    creature_stages = rewards.get("creature_stages") or {"aqua_buddy": 0, "leaf_friend": 0, "spark_pal": 0, "blaze_heart": 0}

    if isinstance(creature_points, str):
        import json
        creature_points = json.loads(creature_points)
    if isinstance(creature_stages, str):
        import json
        creature_stages = json.loads(creature_stages)

    new_points = creature_points.get(target_creature, 0) + points_to_add
    creature_points[target_creature] = new_points

    # Check evolution
    thresholds = POINTS_CONFIG["evolution_thresholds"]
    current_stage = creature_stages.get(target_creature, 0)
    evolved = False
    new_stage = current_stage
    for i, threshold in enumerate(thresholds):
        if new_points >= threshold:
            new_stage = i
    if new_stage > current_stage:
        evolved = True
        creature_stages[target_creature] = new_stage

    total_points = rewards.get("total_points_earned", 0) + points_to_add

    update_data = {
        "total_points_earned": total_points,
        "streak_days": streak_days,
        "last_checkin_date": today if req.points_type == "checkin" else last_checkin,
        "creature_points": creature_points,
        "creature_stages": creature_stages,
        "current_creature_id": target_creature,
        "current_stage": new_stage,
        "current_points": new_points
    }

    if rewards_result.data:
        supabase.table("student_rewards").update(update_data).eq("student_id", student_id).execute()
    else:
        update_data["student_id"] = student_id
        supabase.table("student_rewards").insert(update_data).execute()

    creature_data = next((c for c in CREATURES if c["id"] == target_creature), CREATURES[0])

    return {
        "current_creature": creature_data,
        "current_stage": new_stage,
        "current_points": new_points,
        "evolved": evolved,
        "streak_days": streak_days,
        "total_points_earned": total_points,
        "all_creatures_progress": creature_points,
        "feeling_colour": feeling_colour,
        "zone": feeling_colour  # backwards compat
    }

# ================== ANALYTICS ==================
@api_router.get("/analytics/student/{student_id}")
async def get_student_analytics(student_id: str, days: int = 7):
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    logs = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start_date).execute()
    logs_data = logs.data or []

    feeling_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    helper_counts = {}
    daily_data = {}

    for log in logs_data:
        colour = log.get("feeling_colour", log.get("zone", ""))
        if colour in feeling_counts:
            feeling_counts[colour] += 1
        for h in log.get("helpers_selected", log.get("strategies_selected", [])):
            helper_counts[h] = helper_counts.get(h, 0) + 1
        day = log["timestamp"][:10]
        if day not in daily_data:
            daily_data[day] = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
        if colour in daily_data[day]:
            daily_data[day][colour] += 1

    top_helpers = sorted(helper_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    return {
        "feeling_counts": feeling_counts,
        "zone_counts": feeling_counts,  # backwards compat
        "total_logs": len(logs_data),
        "helper_counts": dict(top_helpers),
        "strategy_counts": dict(top_helpers),  # backwards compat
        "daily_data": daily_data,
        "period_days": days
    }

@api_router.get("/analytics/classroom/{classroom_id}")
async def get_classroom_analytics(classroom_id: str, days: int = 7):
    students = supabase.table("students").select("*").eq("classroom_id", classroom_id).execute()
    students_data = students.data or []
    student_ids = [s["id"] for s in students_data]

    if not student_ids:
        return {"feeling_counts": {"blue": 0, "green": 0, "yellow": 0, "red": 0}, "total_logs": 0, "students_count": 0}

    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    feeling_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    daily_data = {}

    for sid in student_ids:
        logs = supabase.table("feeling_logs").select("*").eq("student_id", sid).gte("timestamp", start_date).execute()
        for log in (logs.data or []):
            colour = log.get("feeling_colour", log.get("zone", ""))
            if colour in feeling_counts:
                feeling_counts[colour] += 1
            day = log["timestamp"][:10]
            if day not in daily_data:
                daily_data[day] = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
            if colour in daily_data[day]:
                daily_data[day][colour] += 1

    return {
        "feeling_counts": feeling_counts,
        "zone_counts": feeling_counts,
        "total_logs": sum(feeling_counts.values()),
        "students_count": len(students_data),
        "daily_data": daily_data
    }

# ================== RESOURCES ==================
@api_router.get("/resources")
async def get_resources(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = supabase.table("resources").select("*").eq("is_active", True).execute()
    return result.data or []

@api_router.post("/resources")
async def create_resource(resource: ResourceCreate, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if user.get("role") not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Teachers only")
    new_resource = {
        "id": str(uuid.uuid4()),
        "created_by": user["user_id"],
        "title": resource.title,
        "description": resource.description,
        "content_type": resource.content_type,
        "content": resource.content,
        "pdf_filename": resource.pdf_filename,
        "category": resource.category,
        "is_global": resource.is_global,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = supabase.table("resources").insert(new_resource).execute()
    return result.data[0] if result.data else new_resource

@api_router.delete("/resources/{resource_id}")
async def delete_resource(resource_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    supabase.table("resources").delete().eq("id", resource_id).execute()
    return {"message": "Resource deleted"}

# ================== FAMILY / PARENT ==================
@api_router.get("/family/members")
async def get_family_members(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = supabase.table("family_members").select("*").eq("user_id", user["user_id"]).execute()
    return result.data or []

@api_router.post("/family/members")
async def add_family_member(member: FamilyMemberCreate, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    new_member = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "name": member.name,
        "relationship": member.relationship,
        "avatar_type": member.avatar_type,
        "avatar_preset": member.avatar_preset,
        "avatar_custom": member.avatar_custom,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = supabase.table("family_members").insert(new_member).execute()
    return result.data[0] if result.data else new_member

@api_router.delete("/family/members/{member_id}")
async def delete_family_member(member_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    supabase.table("family_members").delete().eq("id", member_id).execute()
    return {"message": "Member deleted"}

@api_router.post("/parent/link-child")
async def link_child(body: LinkChildRequest, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = supabase.table("students").select("*").eq("link_code", body.link_code).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Invalid link code")
    student = result.data[0]
    if student.get("link_code_expires_at"):
        exp = datetime.fromisoformat(student["link_code_expires_at"].replace("Z", "+00:00"))
        if exp < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Link code expired")
    # Link parent to student
    supabase.table("parent_links").insert({
        "id": str(uuid.uuid4()),
        "parent_user_id": user["user_id"],
        "student_id": student["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    }).execute()
    return {"message": "Child linked successfully", "student": student}

@api_router.get("/parent/children")
async def get_linked_children(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    links = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).execute()
    children = []
    for link in (links.data or []):
        student = supabase.table("students").select("*").eq("id", link["student_id"]).execute()
        if student.data:
            children.append(student.data[0])
    return children

# ================== PDF REPORTS ==================
@api_router.get("/reports/available-months/{student_id}")
async def get_available_months(student_id: str):
    logs = supabase.table("feeling_logs").select("timestamp").eq("student_id", student_id).execute()
    months = set()
    for log in (logs.data or []):
        month = log["timestamp"][:7]
        months.add(month)
    return sorted(list(months), reverse=True)

@api_router.get("/reports/pdf/student/{student_id}/month/{year}/{month}")
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
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})

# ================== SUBSCRIPTION ==================
@api_router.get("/subscription/plans")
async def get_plans():
    return SUBSCRIPTION_PLANS

@api_router.post("/subscription/start-trial")
async def start_trial(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    now = datetime.now(timezone.utc)
    supabase.table("users").update({
        "subscription_status": "trial",
        "trial_started_at": now.isoformat()
    }).eq("user_id", user["user_id"]).execute()
    return {"message": "Trial started", "trial_ends": (now + timedelta(days=TRIAL_DURATION_DAYS)).isoformat()}

@api_router.get("/subscription/status")
async def get_subscription_status(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    is_active = check_subscription_active(user)
    return {
        "is_active": is_active,
        "status": user.get("subscription_status", "none"),
        "expires_at": user.get("subscription_expires_at"),
        "trial_started_at": user.get("trial_started_at")
    }

# ================== ADMIN ==================
@api_router.get("/admin/stats")
async def get_admin_stats(request: Request):
    user = await get_current_user(request)
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    users = supabase.table("users").select("*").execute()
    students = supabase.table("students").select("*").execute()
    logs = supabase.table("feeling_logs").select("*").execute()
    return {
        "total_users": len(users.data or []),
        "total_students": len(students.data or []),
        "total_checkins": len(logs.data or []),
    }

# ================== MOUNT ROUTER ==================
app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)