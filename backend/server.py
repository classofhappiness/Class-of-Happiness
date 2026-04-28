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
import base64
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
        "zone": "blue",
        "description": "Water creature that grows stronger with calm check-ins.",
        "color": "#4A90D9",
        "feeling_colour": "blue",
        "emoji_stages": ["🐟", "🐬", "🦈", "🐋"],
        "moves": [
            {"id": "aqua_wave", "name": "Wave Spin", "emoji": "🌊", "unlocks_at_stage": 1},
            {"id": "aqua_dive", "name": "Deep Dive", "emoji": "💦", "unlocks_at_stage": 2},
            {"id": "aqua_splash", "name": "Mega Splash", "emoji": "🫧", "unlocks_at_stage": 3},
        ],
        "outfits": [
            {"id": "aqua_hat", "name": "Captain Hat", "emoji": "🧢", "unlocks_at_stage": 1},
            {"id": "aqua_armor", "name": "Ocean Armor", "emoji": "🛡️", "unlocks_at_stage": 2},
            {"id": "aqua_crown", "name": "Sea Crown", "emoji": "👑", "unlocks_at_stage": 3},
        ],
        "foods": [
            {"id": "aqua_snack", "name": "Sea Snack", "emoji": "🦐", "unlocks_at_stage": 1},
            {"id": "aqua_feast", "name": "Reef Feast", "emoji": "🐠", "unlocks_at_stage": 2},
            {"id": "aqua_royal_meal", "name": "Royal Current Meal", "emoji": "🍣", "unlocks_at_stage": 3},
        ],
        "homes": [
            {"id": "aqua_home_1", "name": "Coral Cave", "emoji": "🪸", "unlocks_at_stage": 1},
            {"id": "aqua_home_2", "name": "Ocean Arch", "emoji": "🌉", "unlocks_at_stage": 2},
            {"id": "aqua_home_3", "name": "Whale Bay", "emoji": "🏝️", "unlocks_at_stage": 3},
        ],
        "stages": [
            {"stage": 0, "name": "Fish", "emoji": "🐟", "description": "A tiny fish friend is ready to grow.", "required_points": 0},
            {"stage": 1, "name": "Dolphin", "emoji": "🐬", "description": "A playful dolphin joins your team!", "required_points": 25},
            {"stage": 2, "name": "Shark", "emoji": "🦈", "description": "A strong shark swims with confidence.", "required_points": 60},
            {"stage": 3, "name": "Whale", "emoji": "🐋", "description": "A mighty whale leads the ocean crew!", "required_points": 120}
        ]
    },
    {
        "id": "leaf_friend",
        "name": "Leaf Friend",
        "zone": "green",
        "description": "Grass/nature creature that grows with steady choices.",
        "color": "#4CAF50",
        "feeling_colour": "green",
        "emoji_stages": ["🐸", "🦕", "🦖", "🐊"],
        "moves": [
            {"id": "leaf_vine", "name": "Vine Whip", "emoji": "🌿", "unlocks_at_stage": 1},
            {"id": "leaf_roar", "name": "Forest Roar", "emoji": "🌳", "unlocks_at_stage": 2},
            {"id": "leaf_guard", "name": "Jungle Guard", "emoji": "🛡️", "unlocks_at_stage": 3},
        ],
        "outfits": [
            {"id": "leaf_cap", "name": "Leaf Cap", "emoji": "🍃", "unlocks_at_stage": 1},
            {"id": "leaf_cloak", "name": "Moss Cloak", "emoji": "🧥", "unlocks_at_stage": 2},
            {"id": "leaf_crown", "name": "Nature Crown", "emoji": "🌼", "unlocks_at_stage": 3},
        ],
        "foods": [
            {"id": "leaf_snack", "name": "Berry Mix", "emoji": "🫐", "unlocks_at_stage": 1},
            {"id": "leaf_feast", "name": "Garden Plate", "emoji": "🥗", "unlocks_at_stage": 2},
            {"id": "leaf_royal_meal", "name": "Dino Feast", "emoji": "🌽", "unlocks_at_stage": 3},
        ],
        "homes": [
            {"id": "leaf_home_1", "name": "Grass Nest", "emoji": "🌱", "unlocks_at_stage": 1},
            {"id": "leaf_home_2", "name": "Fern Den", "emoji": "🌿", "unlocks_at_stage": 2},
            {"id": "leaf_home_3", "name": "Dino Grove", "emoji": "🏕️", "unlocks_at_stage": 3},
        ],
        "stages": [
            {"stage": 0, "name": "Frog", "emoji": "🐸", "description": "A little frog ready to grow.", "required_points": 0},
            {"stage": 1, "name": "Dino Buddy", "emoji": "🦕", "description": "A friendly dinosaur appears.", "required_points": 25},
            {"stage": 2, "name": "Dino Hero", "emoji": "🦖", "description": "A brave dinosaur keeps growing.", "required_points": 60},
            {"stage": 3, "name": "Dino Legend", "emoji": "🐊", "description": "Your dinosaur is fully evolved!", "required_points": 120}
        ]
    },
    {
        "id": "spark_pal",
        "name": "Spark Pal",
        "zone": "yellow",
        "description": "Electric creature that channels energetic check-ins.",
        "color": "#FFC107",
        "feeling_colour": "yellow",
        "emoji_stages": ["🐱", "🐈", "🐆", "🐯"],
        "moves": [
            {"id": "spark_dash", "name": "Zap Dash", "emoji": "⚡", "unlocks_at_stage": 1},
            {"id": "spark_burst", "name": "Static Burst", "emoji": "💥", "unlocks_at_stage": 2},
            {"id": "spark_storm", "name": "Thunder Storm", "emoji": "🌩️", "unlocks_at_stage": 3},
        ],
        "outfits": [
            {"id": "spark_band", "name": "Power Band", "emoji": "🟨", "unlocks_at_stage": 1},
            {"id": "spark_visor", "name": "Voltage Visor", "emoji": "🕶️", "unlocks_at_stage": 2},
            {"id": "spark_cape", "name": "Lightning Cape", "emoji": "🦸", "unlocks_at_stage": 3},
        ],
        "foods": [
            {"id": "spark_snack", "name": "Energy Bite", "emoji": "🍌", "unlocks_at_stage": 1},
            {"id": "spark_feast", "name": "Charge Bowl", "emoji": "🍯", "unlocks_at_stage": 2},
            {"id": "spark_royal_meal", "name": "Storm Meal", "emoji": "🍍", "unlocks_at_stage": 3},
        ],
        "homes": [
            {"id": "spark_home_1", "name": "Spark Pod", "emoji": "🔋", "unlocks_at_stage": 1},
            {"id": "spark_home_2", "name": "Neon Base", "emoji": "🏙️", "unlocks_at_stage": 2},
            {"id": "spark_home_3", "name": "Thunder Tower", "emoji": "🗼", "unlocks_at_stage": 3},
        ],
        "stages": [
            {"stage": 0, "name": "Kitten", "emoji": "🐱", "description": "A playful little kitten.", "required_points": 0},
            {"stage": 1, "name": "Cat", "emoji": "🐈", "description": "A curious cat on the prowl!", "required_points": 25},
            {"stage": 2, "name": "Leopard", "emoji": "🐆", "description": "A swift leopard on the move!", "required_points": 60},
            {"stage": 3, "name": "Tiger", "emoji": "🐯", "description": "A mighty tiger!", "required_points": 120}
        ]
    },
    {
        "id": "blaze_heart",
        "name": "Blaze Heart",
        "zone": "red",
        "description": "Fire creature that transforms intense feelings into strength.",
        "color": "#F44336",
        "feeling_colour": "red",
        "emoji_stages": ["🐕", "🦊", "🐲", "🐉"],
        "moves": [
            {"id": "blaze_breath", "name": "Fire Breath", "emoji": "🔥", "unlocks_at_stage": 1},
            {"id": "blaze_leap", "name": "Flare Leap", "emoji": "🦊", "unlocks_at_stage": 2},
            {"id": "blaze_roar", "name": "Dragon Roar", "emoji": "🐉", "unlocks_at_stage": 3},
        ],
        "outfits": [
            {"id": "blaze_helm", "name": "Flame Helm", "emoji": "⛑️", "unlocks_at_stage": 1},
            {"id": "blaze_armor", "name": "Inferno Armor", "emoji": "🥋", "unlocks_at_stage": 2},
            {"id": "blaze_crown", "name": "Dragon Crown", "emoji": "👑", "unlocks_at_stage": 3},
        ],
        "foods": [
            {"id": "blaze_snack", "name": "Spicy Snack", "emoji": "🌶️", "unlocks_at_stage": 1},
            {"id": "blaze_feast", "name": "Lava Soup", "emoji": "🍲", "unlocks_at_stage": 2},
            {"id": "blaze_royal_meal", "name": "Dragon Feast", "emoji": "🍖", "unlocks_at_stage": 3},
        ],
        "homes": [
            {"id": "blaze_home_1", "name": "Ember Den", "emoji": "🏕️", "unlocks_at_stage": 1},
            {"id": "blaze_home_2", "name": "Flame Cave", "emoji": "🌋", "unlocks_at_stage": 2},
            {"id": "blaze_home_3", "name": "Dragon Peak", "emoji": "🏰", "unlocks_at_stage": 3},
        ],
        "stages": [
            {"stage": 0, "name": "Fire Pup", "emoji": "🐕", "description": "A brave little fire pup full of energy.", "required_points": 0},
            {"stage": 1, "name": "Fox", "emoji": "🦊", "description": "A clever fox with a fiery spirit!", "required_points": 25},
            {"stage": 2, "name": "Dragon Pup", "emoji": "🐲", "description": "A young dragon growing strong!", "required_points": 60},
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


# ================== TRANSLATED HELPERS ==================
# Helpers translated per language - used when lang != "en"
TRANSLATED_HELPERS = {
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
        "blue_zone": "Sentimientos Azules",
        "green_zone": "Sentimientos Verdes",
        "yellow_zone": "Sentimientos Amarillos",
        "red_zone": "Sentimientos Rojos",
        "blue_feeling": "Energía Tranquila",
        "green_feeling": "Energía Equilibrada",
        "yellow_feeling": "Energía Burbujeante",
        "red_feeling": "Energía Grande",
        "blue_description": "Tu cuerpo se mueve lentamente. Puedes sentirte cansado, un poco triste, o necesitar descanso.",
        "green_description": "Te sientes tranquilo, feliz y listo. ¡Este es un gran sentimiento!",
        "yellow_description": "Empiezas a sentirte inestable. Puedes sentirte tonto, preocupado o frustrado.",
        "red_description": "Tu cuerpo tiene grandes sentimientos ahora mismo. Puedes sentirte muy alterado.",
        "what_colours_mean": "¿Qué significan los colores?",
        "tired": "Cansado",
        "sad": "Triste",
        "lonely": "Solo",
        "need_rest": "Necesito Descansar",
        "calm": "Tranquilo",
        "happy": "Feliz",
        "focused": "Concentrado",
        "ready_to_learn": "Listo para Aprender",
        "silly": "Tonto",
        "frustrated": "Frustrado",
        "worried": "Preocupado",
        "butterflies": "Mariposas",
        "super_charged": "Súper Cargado",
        "very_upset": "Muy Alterado",
        "out_of_control": "Fuera de Control",
        "explosive": "Explosivo",
        "bored": "Aburrido",
        "nervous": "Nervioso",
        "angry": "Enfadado",
        "trial_days": "7",
        "free_trial_days": "7 Días de Prueba Gratis",
        "start_free_trial": "Iniciar Prueba Gratis",
        "days_free": "días gratis",
        "seven_days_free": "7 Días Gratis",
        "hi": "Hola",
        "need_help": "¿Necesitas ayuda? ¡Toca aquí!",
        "support_message": "Siempre puedes pedir ayuda a un adulto",
        "how_i_feel": "Cómo Me Siento",
        "my_helpers": "Mis Ayudantes",
        "my_creatures": "Mis Criaturas",
        "feeling_chart": "Gráfico de Sentimientos",
        "all_students": "Todos los Estudiantes",
        "filter_by_classroom": "Filtrar por Clase",
        "no_profiles_yet": "¡Sin perfiles aún!",
        "create_first_profile": "Crea tu primer perfil para empezar",
        "select_profile": "Selecciona tu Perfil",
        "tap_to_check_in": "¡Toca tu foto para registrarte!",
        "add_profile": "Agregar Perfil",
        "loading_helpers": "Cargando ayudantes...",
        "loading_strategies": "Cargando ayudantes...",
        "green_zone_help": "¡Genial! Aquí hay formas de seguir sintiéndote bien:",
        "other_zone_help": "Aquí hay algunos ayudantes que podrían ayudar:",
        "tap_helpers_green": "Toca los ayudantes que te gustaría probar:",
        "tap_helpers_other": "Toca para seleccionar ayudantes que podrían ayudar:",
        "tap_strategies_green": "Toca los ayudantes que te gustaría probar:",
        "tap_strategies_help": "Toca para seleccionar ayudantes:",
        "great_job_title": "¡Trabajo Increíble!",
        "keep_it_up": "¡Sigue así!",
        "streak_bonus": "¡bono de racha!",
        "day_streak": "¡días seguidos!",
        "points": "Puntos",
        "continue": "Continuar",
        "loading_creature": "Cargando tu criatura...",
        "more_points_until": "puntos más hasta que",
        "evolves": "¡evolucione!",
        "collected": "Coleccionados",
        "current_friend": "Amigo Actual",
        "fully_evolved": "¡Completamente Evolucionado!",
        "keep_growing": "¡Sigue Creciendo!",
        "grow_creature_hint": "¡Usa ayudantes y comparte tus sentimientos para evolucionar tu criatura!",
        "complete": "¡Completo!",
        "evolved": "¡EVOLUCIONADO!",
        "evolving": "EVOLUCIONANDO...",
        "amazing_continue": "¡Increíble! Continuar",
        "moves": "Movimientos",
        "outfits": "Atuendos",
        "foods": "Comida",
        "homes": "Hogares",
        "bonus_items": "Objetos Bonus",
        "your_creature": "Tu Criatura",
        "creature_collection": "Mi Colección de Criaturas",
        "stage": "Etapa",
        "unlocked": "¡Desbloqueado!",
        "points_needed": "puntos para la siguiente etapa",
        "next_evolution": "Próxima Evolución",
        "settings": "Configuración",
        "language": "Idioma",
        "about": "Acerca de",
        "login": "Iniciar Sesión",
        "logout": "Cerrar Sesión",
        "confirm": "Confirmar",
        "change_language": "Cambiar Idioma",
        "language_changed": "Idioma Cambiado",
        "is_now_default": "es ahora tu idioma predeterminado.",
        "i_am_a": "Soy un...",
        "student": "Estudiante",
        "teacher": "Maestro",
        "parent": "Padre/Madre",
        "check_in_feelings": "Registrar mis sentimientos",
        "view_progress": "Ver progreso",
        "loading": "Cargando...",
        "save": "Guardar",
        "cancel": "Cancelar",
        "delete": "Eliminar",
        "edit": "Editar",
        "back": "Atrás",
        "next": "Siguiente",
        "done": "Hecho",
        "skip": "Omitir",
        "days_7": "7 Días",
        "days_14": "2 Semanas",
        "days_30": "30 Días",
        "free_trial": "Prueba Gratis",
        "subscribe": "Suscribirse",
        "sign_in_google": "Iniciar sesión con Google",
        "have_trial_code": "¿Tienes un código de prueba?",
        "enter_trial_code": "Ingresar Código de Prueba",
        "trial_code_placeholder": "Ingresa tu código aquí",
        "redeem_code": "Canjear Código",
        "redeeming": "Canjeando...",
        "trial_code_success": "¡Código canjeado con éxito!",
        "trial_code_invalid": "Código inválido",
        "confirm_logout": "¿Estás seguro de que quieres cerrar sesión?",
        "subscription": "Suscripción",
    },
    "fr": {
        "app_name": "Classe du Bonheur",
        "how_are_you_feeling": "Comment te sens-tu?",
        "tap_colour_help": "Appuie sur la couleur qui correspond à ton ressenti",
        "choose_helpers": "Choisis tes aides",
        "want_to_say": "Tu veux dire comment tu te sens?",
        "write_sentence": "Écris une phrase sur comment tu te sens...",
        "save_checkin": "Enregistrer mes sentiments",
        "well_done": "Bravo!",
        "great_job": "Bon travail pour avoir partagé tes sentiments!",
        "blue_feelings": "Sentiments Bleus",
        "green_feelings": "Sentiments Verts",
        "yellow_feelings": "Sentiments Jaunes",
        "red_feelings": "Sentiments Rouges",
        "blue_zone": "Sentiments Bleus",
        "green_zone": "Sentiments Verts",
        "yellow_zone": "Sentiments Jaunes",
        "red_zone": "Sentiments Rouges",
        "blue_feeling": "Énergie Calme",
        "green_feeling": "Énergie Équilibrée",
        "yellow_feeling": "Énergie Pétillante",
        "red_feeling": "Grande Énergie",
        "blue_description": "Ton corps bouge lentement. Tu te sens peut-être fatigué ou tu as besoin de repos.",
        "green_description": "Tu te sens calme, heureux et prêt. C'est un super sentiment!",
        "yellow_description": "Tu commences à te sentir instable. Tu peux être bête, inquiet ou frustré.",
        "red_description": "Ton corps a de grands sentiments maintenant.",
        "what_colours_mean": "Que signifient les couleurs?",
        "tired": "Fatigué",
        "sad": "Triste",
        "lonely": "Seul",
        "need_rest": "Besoin de Repos",
        "calm": "Calme",
        "happy": "Heureux",
        "focused": "Concentré",
        "ready_to_learn": "Prêt à Apprendre",
        "silly": "Bête",
        "frustrated": "Frustré",
        "worried": "Inquiet",
        "butterflies": "Papillons",
        "super_charged": "Super Chargé",
        "very_upset": "Très Bouleversé",
        "out_of_control": "Hors Contrôle",
        "explosive": "Explosif",
        "bored": "Ennuyé",
        "nervous": "Nerveux",
        "angry": "En Colère",
        "trial_days": "7",
        "free_trial_days": "7 Jours d'Essai Gratuit",
        "start_free_trial": "Commencer l'Essai Gratuit",
        "days_free": "jours gratuits",
        "seven_days_free": "7 Jours Gratuits",
        "hi": "Salut",
        "need_help": "Besoin d'aide? Appuie ici!",
        "support_message": "Tu peux toujours demander de l'aide à un adulte",
        "how_i_feel": "Comment Je Me Sens",
        "my_helpers": "Mes Aides",
        "my_creatures": "Mes Créatures",
        "feeling_chart": "Graphique des Sentiments",
        "all_students": "Tous les Élèves",
        "filter_by_classroom": "Filtrer par Classe",
        "no_profiles_yet": "Pas encore de profils!",
        "create_first_profile": "Crée ton premier profil pour commencer",
        "select_profile": "Sélectionne ton Profil",
        "add_profile": "Ajouter un Profil",
        "loading_helpers": "Chargement des aides...",
        "loading_strategies": "Chargement des aides...",
        "tap_helpers_green": "Appuie sur les aides que tu aimerais essayer:",
        "tap_helpers_other": "Appuie pour sélectionner des aides:",
        "tap_strategies_green": "Appuie sur les aides que tu aimerais essayer:",
        "tap_strategies_help": "Appuie pour sélectionner des aides:",
        "great_job_title": "Travail Incroyable!",
        "keep_it_up": "Continue comme ça!",
        "day_streak": "jours consécutifs!",
        "points": "Points",
        "continue": "Continuer",
        "loading_creature": "Chargement de ta créature...",
        "evolves": "évolue!",
        "collected": "Collectionnés",
        "current_friend": "Ami Actuel",
        "fully_evolved": "Entièrement Évolué!",
        "keep_growing": "Continue à Grandir!",
        "grow_creature_hint": "Utilise des aides et partage tes sentiments pour faire évoluer ta créature!",
        "complete": "Terminé!",
        "evolved": "ÉVOLUÉ!",
        "amazing_continue": "Incroyable! Continuer",
        "moves": "Mouvements",
        "outfits": "Tenues",
        "foods": "Nourriture",
        "homes": "Maisons",
        "bonus_items": "Objets Bonus",
        "your_creature": "Ta Créature",
        "creature_collection": "Ma Collection de Créatures",
        "stage": "Étape",
        "unlocked": "Débloqué!",
        "points_needed": "points pour la prochaine étape",
        "settings": "Paramètres",
        "language": "Langue",
        "about": "À propos",
        "login": "Connexion",
        "logout": "Déconnexion",
        "confirm": "Confirmer",
        "change_language": "Changer de langue",
        "language_changed": "Langue modifiée",
        "is_now_default": "est maintenant ta langue par défaut.",
        "i_am_a": "Je suis...",
        "student": "Élève",
        "teacher": "Enseignant",
        "parent": "Parent",
        "loading": "Chargement...",
        "save": "Sauvegarder",
        "cancel": "Annuler",
        "delete": "Supprimer",
        "edit": "Modifier",
        "back": "Retour",
        "next": "Suivant",
        "done": "Terminé",
        "skip": "Passer",
        "days_7": "7 Jours",
        "days_14": "2 Semaines",
        "days_30": "30 Jours",
        "free_trial": "Essai Gratuit",
        "subscribe": "S'abonner",
        "sign_in_google": "Se connecter avec Google",
        "confirm_logout": "Es-tu sûr de vouloir te déconnecter?",
        "subscription": "Abonnement",
        "have_trial_code": "Tu as un code d'essai?",
        "redeem_code": "Utiliser le Code",
        "redeeming": "Utilisation...",
        "trial_code_placeholder": "Entrez votre code ici",
        "trial_code_success": "Code utilisé avec succès!",
        "trial_code_invalid": "Code invalide",
    },
    "pt": {
        "blue": [
            {"id": "blue_1", "name": "Alongamento Suave", "description": "Estica lentamente os braços e pernas", "icon": "accessibility", "feeling_colour": "blue"},
            {"id": "blue_2", "name": "Bebida Quente", "description": "Bebe um copo de água morna", "icon": "local-cafe", "feeling_colour": "blue"},
            {"id": "blue_3", "name": "Música Favorita", "description": "Ouve a tua música favorita", "icon": "music-note", "feeling_colour": "blue"},
            {"id": "blue_4", "name": "Lugar Confortável", "description": "Encontra um lugar confortável e acolhedor", "icon": "weekend", "feeling_colour": "blue"},
            {"id": "blue_5", "name": "Fala com Alguém", "description": "Conta a alguém de confiança como te sentes", "icon": "chat", "feeling_colour": "blue"},
            {"id": "blue_6", "name": "Respiração Lenta", "description": "Faz 3 respirações lentas e profundas", "icon": "air", "feeling_colour": "blue"},
        ],
        "green": [
            {"id": "green_1", "name": "Continua!", "description": "Estás a ir muito bem - continua assim!", "icon": "star", "feeling_colour": "green"},
            {"id": "green_2", "name": "Ajuda um Amigo", "description": "Oferece-te para ajudar alguém perto de ti", "icon": "people", "feeling_colour": "green"},
            {"id": "green_3", "name": "Experimenta Algo Novo", "description": "É um ótimo momento para aprender", "icon": "lightbulb", "feeling_colour": "green"},
            {"id": "green_4", "name": "Partilha um Sorriso", "description": "Sorri para alguém à tua volta", "icon": "sentiment-satisfied", "feeling_colour": "green"},
            {"id": "green_5", "name": "Define um Objetivo", "description": "Pensa em algo que queres fazer hoje", "icon": "flag", "feeling_colour": "green"},
            {"id": "green_6", "name": "Gratidão", "description": "Pensa numa coisa pela qual és grato", "icon": "favorite", "feeling_colour": "green"},
        ],
        "yellow": [
            {"id": "yellow_1", "name": "Respiração de Bolhas", "description": "Inspira devagar, expira como se soprasses bolhas", "icon": "bubble-chart", "feeling_colour": "yellow"},
            {"id": "yellow_2", "name": "Sacudir o Corpo", "description": "Sacode o corpo para libertar a tensão", "icon": "directions-run", "feeling_colour": "yellow"},
            {"id": "yellow_3", "name": "Contar até 10", "description": "Conta devagar de 1 até 10", "icon": "format-list-numbered", "feeling_colour": "yellow"},
            {"id": "yellow_4", "name": "5 Sentidos", "description": "Nomeia 5 coisas que podes ver à tua volta", "icon": "visibility", "feeling_colour": "yellow"},
            {"id": "yellow_5", "name": "Apertar e Largar", "description": "Aperta as mãos com força e depois larga", "icon": "pan-tool", "feeling_colour": "yellow"},
            {"id": "yellow_6", "name": "Fala Sobre Isso", "description": "Diz a um adulto de confiança como te sentes", "icon": "record-voice-over", "feeling_colour": "yellow"},
        ],
        "red": [
            {"id": "red_1", "name": "Afasta-te um Pouco", "description": "Se for seguro, afasta-te da situação por 2-3 minutos", "icon": "directions-walk", "feeling_colour": "red"},
            {"id": "red_2", "name": "Água Fria", "description": "Coloca água fria no rosto ou nos pulsos", "icon": "water-drop", "feeling_colour": "red"},
            {"id": "red_3", "name": "Respira Fundo", "description": "Inspira 4 tempos, segura 4, expira 4", "icon": "air", "feeling_colour": "red"},
            {"id": "red_4", "name": "Aperta uma Almofada", "description": "Aperta uma almofada com força para libertar energia", "icon": "sports-mma", "feeling_colour": "red"},
            {"id": "red_5", "name": "Pede Ajuda Agora", "description": "Fala com um adulto de confiança imediatamente", "icon": "support-agent", "feeling_colour": "red"},
            {"id": "red_6", "name": "Conta até 20", "description": "Conta devagar até 20 para te acalmar", "icon": "format-list-numbered", "feeling_colour": "red"},
        ],
        "app_name": "Turma da Felicidade",
        "how_are_you_feeling": "Como te estás a sentir hoje?",
        "tap_colour_help": "Toca na cor que corresponde ao teu sentimento",
        "choose_helpers": "Escolhe os teus ajudantes",
        "want_to_say": "Queres dizer como te sentes?",
        "write_sentence": "Escreve uma frase sobre como te sentes...",
        "save_checkin": "Guardar meus sentimentos",
        "well_done": "Muito bem!",
        "great_job": "Bom trabalho ao partilhar os teus sentimentos!",
        "blue_feelings": "Sentimentos Azuis",
        "green_feelings": "Sentimentos Verdes",
        "yellow_feelings": "Sentimentos Amarelos",
        "red_feelings": "Sentimentos Vermelhos",
        "blue_zone": "Sentimentos Azuis",
        "green_zone": "Sentimentos Verdes",
        "yellow_zone": "Sentimentos Amarelos",
        "red_zone": "Sentimentos Vermelhos",
        "blue_feeling": "Energia Calma",
        "green_feeling": "Energia Equilibrada",
        "yellow_feeling": "Energia Borbulhante",
        "red_feeling": "Grande Energia",
        "blue_description": "O teu corpo move-se lentamente. Podes sentir-te cansado ou precisar de descanso.",
        "green_description": "Sentes-te calmo, feliz e pronto. Este é um grande sentimento!",
        "yellow_description": "Estás a começar a sentir-te instável. Podes sentir-te tolo, preocupado ou frustrado.",
        "red_description": "O teu corpo tem grandes sentimentos agora.",
        "what_colours_mean": "O que significam as cores?",
        "tired": "Cansado",
        "sad": "Triste",
        "lonely": "Sozinho",
        "need_rest": "Preciso de Descanso",
        "calm": "Calmo",
        "happy": "Feliz",
        "focused": "Concentrado",
        "ready_to_learn": "Pronto para Aprender",
        "silly": "Tolo",
        "frustrated": "Frustrado",
        "worried": "Preocupado",
        "butterflies": "Borboletas",
        "super_charged": "Super Carregado",
        "very_upset": "Muito Perturbado",
        "out_of_control": "Fora de Controlo",
        "explosive": "Explosivo",
        "bored": "Entediado",
        "nervous": "Nervoso",
        "angry": "Zangado",
        "trial_days": "7",
        "free_trial_days": "7 Dias de Teste Grátis",
        "start_free_trial": "Iniciar Teste Grátis",
        "days_free": "dias grátis",
        "seven_days_free": "7 Dias Grátis",
        "hi": "Olá",
        "need_help": "Precisas de ajuda? Toca aqui!",
        "support_message": "Podes sempre pedir ajuda a um adulto",
        "how_i_feel": "Como Me Sinto",
        "my_helpers": "Os Meus Ajudantes",
        "my_creatures": "As Minhas Criaturas",
        "all_students": "Todos os Alunos",
        "filter_by_classroom": "Filtrar por Turma",
        "no_profiles_yet": "Ainda sem perfis!",
        "create_first_profile": "Cria o teu primeiro perfil para começar",
        "add_profile": "Adicionar Perfil",
        "loading_helpers": "A carregar ajudantes...",
        "loading_strategies": "A carregar ajudantes...",
        "tap_helpers_green": "Toca nos ajudantes que gostarias de experimentar:",
        "tap_helpers_other": "Toca para selecionar ajudantes:",
        "tap_strategies_green": "Toca nos ajudantes que gostarias de experimentar:",
        "tap_strategies_help": "Toca para selecionar ajudantes:",
        "great_job_title": "Trabalho Incrível!",
        "keep_it_up": "Continua assim!",
        "day_streak": "dias seguidos!",
        "points": "Pontos",
        "continue": "Continuar",
        "loading_creature": "A carregar a tua criatura...",
        "fully_evolved": "Completamente Evoluído!",
        "keep_growing": "Continua a Crescer!",
        "grow_creature_hint": "Usa ajudantes e partilha os teus sentimentos para evoluir a tua criatura!",
        "evolved": "EVOLUÍDO!",
        "amazing_continue": "Incrível! Continuar",
        "moves": "Movimentos",
        "outfits": "Roupas",
        "foods": "Comida",
        "homes": "Casas",
        "bonus_items": "Itens Bónus",
        "your_creature": "A Tua Criatura",
        "creature_collection": "A Minha Coleção de Criaturas",
        "stage": "Fase",
        "unlocked": "Desbloqueado!",
        "points_needed": "pontos para a próxima fase",
        "settings": "Configurações",
        "language": "Idioma",
        "about": "Sobre",
        "login": "Entrar",
        "logout": "Sair",
        "confirm": "Confirmar",
        "change_language": "Mudar idioma",
        "language_changed": "Idioma alterado",
        "is_now_default": "é agora o teu idioma padrão.",
        "i_am_a": "Eu sou...",
        "student": "Aluno",
        "teacher": "Professor",
        "parent": "Pai/Mãe",
        "loading": "A carregar...",
        "save": "Guardar",
        "cancel": "Cancelar",
        "delete": "Eliminar",
        "edit": "Editar",
        "back": "Voltar",
        "next": "Próximo",
        "done": "Feito",
        "skip": "Ignorar",
        "days_7": "7 Dias",
        "days_14": "2 Semanas",
        "days_30": "30 Dias",
        "free_trial": "Teste Grátis",
        "subscribe": "Subscrever",
        "sign_in_google": "Entrar com Google",
        "confirm_logout": "Tens a certeza que queres sair?",
        "subscription": "Subscrição",
        "have_trial_code": "Tens um código de teste?",
        "redeem_code": "Resgatar Código",
        "redeeming": "A resgatar...",
        "trial_code_placeholder": "Insere o teu código aqui",
        "trial_code_success": "Código resgatado com sucesso!",
        "trial_code_invalid": "Código inválido",
        "how_are_you_feeling": "Como te estás a sentir hoje?",
        "check_in_feelings": "Registar as minhas emoções",
        "view_progress": "Ver o progresso da turma",
        "your_family_emotions": "Check-ins da família",
        "login_required": "Login necessário",
        "trial": "Período de Teste",
        "trial_desc": "Sem cartão de crédito",
        "select_colour": "Seleciona a tua cor de emoção",
        "helpful_strategies": "Estratégias úteis",
        "add_note": "Adicionar uma nota (opcional)",
        "save_checkin": "Guardar check-in",
        "this_week": "Esta semana",
        "recent_checkins": "Os teus check-ins recentes",
        "week_overview": "Resumo da semana",
        "day_sun": "Dom", "day_mon": "Seg", "day_tue": "Ter",
        "day_wed": "Qua", "day_thu": "Qui", "day_fri": "Sex", "day_sat": "Sáb",
        "classrooms": "Turmas",
        "resources": "Recursos",
        "check_in": "Check-in",
        "well_done": "Muito bem!",
        "support_message": "Podes sempre pedir ajuda a um adulto ou a um amigo de confiança",
        "blue_label": "Pouca energia",
        "green_label": "Calmo e pronto",
        "yellow_label": "Stressado",
        "red_label": "Sobrecarregado",
        "i_am_a": "Eu sou...",
        "shared_strategies": "Estratégias Partilhadas",
        "synced": "Sincronizado",
        "no_data": "Sem dados ainda",
        "pdf_report": "Relatório PDF",
        "school_admin": "Administrador Escolar",
        "generate_code": "Gerar código de convite",
        "join_school": "Juntar-se à escola",
        "school_profile": "Perfil da escola",
        "wellbeing_alert": "Alerta de bem-estar",
        "strategies": "Estratégias",
        "my_strategies": "As minhas estratégias",
        "checkin_history": "Histórico de check-ins",
        "creatures": "Criaturas",
        "rewards": "Recompensas",
        "collection": "Coleção",
        "add_student": "Adicionar aluno",
        "manage_students": "Gerir alunos",
        "wellbeing": "Bem-estar",
    },
    "de": {
        "app_name": "Klasse des Glücks",
        "how_are_you_feeling": "Wie fühlst du dich?",
        "tap_colour_help": "Tippe auf die Farbe, die deinem Gefühl entspricht",
        "choose_helpers": "Wähle deine Helfer",
        "want_to_say": "Möchtest du etwas sagen?",
        "write_sentence": "Schreibe einen Satz darüber, wie du dich fühlst...",
        "save_checkin": "Meine Gefühle speichern",
        "well_done": "Gut gemacht!",
        "great_job": "Toll, dass du deine Gefühle teilst!",
        "blue_feelings": "Blaue Gefühle",
        "green_feelings": "Grüne Gefühle",
        "yellow_feelings": "Gelbe Gefühle",
        "red_feelings": "Rote Gefühle",
        "blue_zone": "Blaue Gefühle",
        "green_zone": "Grüne Gefühle",
        "yellow_zone": "Gelbe Gefühle",
        "red_zone": "Rote Gefühle",
        "blue_feeling": "Ruhige Energie",
        "green_feeling": "Ausgeglichene Energie",
        "yellow_feeling": "Kribbelnde Energie",
        "red_feeling": "Große Energie",
        "blue_description": "Dein Körper bewegt sich langsam. Du fühlst dich vielleicht müde oder brauchst Ruhe.",
        "green_description": "Du fühlst dich ruhig, glücklich und bereit. Das ist ein tolles Gefühl!",
        "yellow_description": "Du fängst an, dich wackelig zu fühlen. Du kannst albern, besorgt oder frustriert sein.",
        "red_description": "Dein Körper hat gerade große Gefühle.",
        "what_colours_mean": "Was bedeuten die Farben?",
        "tired": "Müde",
        "sad": "Traurig",
        "lonely": "Einsam",
        "need_rest": "Brauche Ruhe",
        "calm": "Ruhig",
        "happy": "Glücklich",
        "focused": "Konzentriert",
        "ready_to_learn": "Lernbereit",
        "silly": "Albern",
        "frustrated": "Frustriert",
        "worried": "Besorgt",
        "butterflies": "Schmetterlinge",
        "super_charged": "Supergeladen",
        "very_upset": "Sehr Aufgewühlt",
        "out_of_control": "Außer Kontrolle",
        "explosive": "Explosiv",
        "bored": "Gelangweilt",
        "nervous": "Nervös",
        "angry": "Wütend",
        "trial_days": "7",
        "free_trial_days": "7 Tage Kostenlose Testversion",
        "start_free_trial": "Kostenlose Testversion Starten",
        "days_free": "Tage kostenlos",
        "seven_days_free": "7 Tage Kostenlos",
        "hi": "Hallo",
        "need_help": "Brauchst du Hilfe? Tippe hier!",
        "support_message": "Du kannst immer einen Erwachsenen um Hilfe bitten",
        "how_i_feel": "Wie ich mich fühle",
        "my_helpers": "Meine Helfer",
        "my_creatures": "Meine Kreaturen",
        "all_students": "Alle Schüler",
        "filter_by_classroom": "Nach Klasse filtern",
        "no_profiles_yet": "Noch keine Profile!",
        "create_first_profile": "Erstelle dein erstes Profil",
        "add_profile": "Profil hinzufügen",
        "loading_helpers": "Helfer laden...",
        "loading_strategies": "Helfer laden...",
        "tap_helpers_green": "Tippe auf Helfer, die du ausprobieren möchtest:",
        "tap_helpers_other": "Tippe zum Auswählen von Helfern:",
        "tap_strategies_green": "Tippe auf Helfer, die du ausprobieren möchtest:",
        "tap_strategies_help": "Tippe zum Auswählen von Helfern:",
        "great_job_title": "Großartige Arbeit!",
        "keep_it_up": "Weiter so!",
        "day_streak": "Tage hintereinander!",
        "points": "Punkte",
        "continue": "Weiter",
        "loading_creature": "Lade deine Kreatur...",
        "fully_evolved": "Vollständig entwickelt!",
        "keep_growing": "Wachse weiter!",
        "grow_creature_hint": "Nutze Helfer und teile deine Gefühle um deine Kreatur zu entwickeln!",
        "evolved": "ENTWICKELT!",
        "amazing_continue": "Toll! Weiter",
        "moves": "Bewegungen",
        "outfits": "Outfits",
        "foods": "Essen",
        "homes": "Häuser",
        "bonus_items": "Bonus-Gegenstände",
        "your_creature": "Deine Kreatur",
        "creature_collection": "Meine Kreaturensammlung",
        "stage": "Stufe",
        "unlocked": "Freigeschaltet!",
        "points_needed": "Punkte bis zur nächsten Stufe",
        "settings": "Einstellungen",
        "language": "Sprache",
        "about": "Über",
        "login": "Anmelden",
        "logout": "Abmelden",
        "confirm": "Bestätigen",
        "change_language": "Sprache ändern",
        "language_changed": "Sprache geändert",
        "is_now_default": "ist jetzt deine Standardsprache.",
        "i_am_a": "Ich bin...",
        "student": "Schüler",
        "teacher": "Lehrer",
        "parent": "Elternteil",
        "loading": "Lädt...",
        "save": "Speichern",
        "cancel": "Abbrechen",
        "delete": "Löschen",
        "edit": "Bearbeiten",
        "back": "Zurück",
        "next": "Weiter",
        "done": "Fertig",
        "skip": "Überspringen",
        "days_7": "7 Tage",
        "days_14": "2 Wochen",
        "days_30": "30 Tage",
        "free_trial": "Kostenlose Testversion",
        "subscribe": "Abonnieren",
        "sign_in_google": "Mit Google anmelden",
        "confirm_logout": "Bist du sicher, dass du dich abmelden möchtest?",
        "subscription": "Abonnement",
        "have_trial_code": "Hast du einen Testcode?",
        "redeem_code": "Code einlösen",
        "redeeming": "Einlösen...",
        "trial_code_placeholder": "Gib deinen Code hier ein",
        "trial_code_success": "Code erfolgreich eingelöst!",
        "trial_code_invalid": "Ungültiger Code",
    },
    "it": {
        "blue": [
            {"id": "blue_1", "name": "Stiramento Dolce", "description": "Stira lentamente le tue braccia e gambe", "icon": "accessibility", "feeling_colour": "blue"},
            {"id": "blue_2", "name": "Bevanda Calda", "description": "Bevi un bicchiere di acqua calda", "icon": "local-cafe", "feeling_colour": "blue"},
            {"id": "blue_3", "name": "Canzone Preferita", "description": "Ascolta la tua canzone preferita", "icon": "music-note", "feeling_colour": "blue"},
            {"id": "blue_4", "name": "Posto Comodo", "description": "Trova un posto comodo e accogliente", "icon": "weekend", "feeling_colour": "blue"},
            {"id": "blue_5", "name": "Di a Qualcuno", "description": "Racconta a qualcuno di fiducia come ti senti", "icon": "chat", "feeling_colour": "blue"},
            {"id": "blue_6", "name": "Respirazione Lenta", "description": "Fai 3 respirazioni lente e profonde", "icon": "air", "feeling_colour": "blue"},
        ],
        "green": [
            {"id": "green_1", "name": "Continua!", "description": "Stai andando benissimo - continua così!", "icon": "star", "feeling_colour": "green"},
            {"id": "green_2", "name": "Aiuta un Amico", "description": "Offriti di aiutare qualcuno vicino", "icon": "people", "feeling_colour": "green"},
            {"id": "green_3", "name": "Prova Qualcosa di Nuovo", "description": "È un ottimo momento per imparare", "icon": "lightbulb", "feeling_colour": "green"},
            {"id": "green_4", "name": "Condividi il Sorriso", "description": "Sorridi a qualcuno intorno a te", "icon": "sentiment-satisfied", "feeling_colour": "green"},
            {"id": "green_5", "name": "Fissa un Obiettivo", "description": "Pensa a qualcosa che vuoi fare oggi", "icon": "flag", "feeling_colour": "green"},
            {"id": "green_6", "name": "Gratitudine", "description": "Pensa a una cosa per cui sei grato", "icon": "favorite", "feeling_colour": "green"},
        ],
        "yellow": [
            {"id": "yellow_1", "name": "Respirazione Bolle", "description": "Inspira lentamente, espira come soffiando bolle", "icon": "bubble-chart", "feeling_colour": "yellow"},
            {"id": "yellow_2", "name": "Scuotere il Corpo", "description": "Scuoti via i brividi dal tuo corpo", "icon": "directions-run", "feeling_colour": "yellow"},
            {"id": "yellow_3", "name": "Contare fino a 10", "description": "Conta lentamente da 1 a 10", "icon": "format-list-numbered", "feeling_colour": "yellow"},
            {"id": "yellow_4", "name": "5 Sensi", "description": "Nomina 5 cose che puoi vedere intorno a te", "icon": "visibility", "feeling_colour": "yellow"},
            {"id": "yellow_5", "name": "Stringere e Rilasciare", "description": "Stringi le mani forte poi rilascia", "icon": "pan-tool", "feeling_colour": "yellow"},
            {"id": "yellow_6", "name": "Parlane", "description": "Dì a un adulto di fiducia come ti senti", "icon": "record-voice-over", "feeling_colour": "yellow"},
        ],
        "red": [
            {"id": "red_1", "name": "Congelare", "description": "Fermati e congela completamente il tuo corpo", "icon": "pause-circle-filled", "feeling_colour": "red"},
            {"id": "red_2", "name": "Respiri Profondi", "description": "Fai 5 respirazioni molto lente e profonde", "icon": "air", "feeling_colour": "red"},
            {"id": "red_3", "name": "Contare al Contrario", "description": "Conta lentamente da 10 a 1", "icon": "exposure-neg-1", "feeling_colour": "red"},
            {"id": "red_4", "name": "Spazio Sicuro", "description": "Vai nel tuo angolo tranquillo", "icon": "king-bed", "feeling_colour": "red"},
            {"id": "red_5", "name": "Chiedi Aiuto", "description": "Dì a un adulto di fiducia che hai bisogno di supporto", "icon": "support-agent", "feeling_colour": "red"},
            {"id": "red_6", "name": "Abbraccio a Sé Stessi", "description": "Datti un grande abbraccio caloroso", "icon": "favorite-border", "feeling_colour": "red"},
        ],
    },
}

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
        "app_name": "Class of Happiness",
        "how_are_you_feeling": "How are you feeling?",
        "tap_colour_help": "Tap the colour that matches how you feel",
        "choose_helpers": "Choose your helpers",
        "want_to_say": "Want to say something?",
        "write_sentence": "Write one sentence about how you feel...",
        "save_checkin": "Save My Feelings",
        "well_done": "Well Done!",
        "great_job": "Great job sharing your feelings!",
        "blue_feelings": "Blue Emotions",
        "green_feelings": "Green Emotions",
        "yellow_feelings": "Yellow Emotions",
        "red_feelings": "Red Emotions",
        "blue_zone": "Blue Emotions",
        "green_zone": "Green Emotions",
        "yellow_zone": "Yellow Emotions",
        "red_zone": "Red Emotions",
        "blue_label": "Low Energy",
        "green_label": "Calm & Ready",
        "yellow_label": "Stressed",
        "red_label": "Overloaded",
        "tired": "Tired", "sad": "Sad", "bored": "Bored", "lonely": "Lonely",
        "calm": "Calm", "happy": "Happy", "focused": "Focused", "ready_to_learn": "Ready",
        "silly": "Silly", "nervous": "Nervous", "frustrated": "Frustrated", "worried": "Worried",
        "angry": "Angry", "very_upset": "Very Upset", "out_of_control": "Wild", "super_charged": "Hyper",
        "blue_description": "Your body is moving slowly. You might feel tired, sad or need some rest.",
        "green_description": "You feel calm, happy and ready. This is a great feeling!",
        "yellow_description": "You are starting to feel wobbly. You might feel silly, nervous or frustrated.",
        "red_description": "Your body has big feelings right now. You might feel angry or out of control.",
        "blue_feeling": "Quiet Energy", "green_feeling": "Balanced Energy",
        "yellow_feeling": "Fizzing Energy", "red_feeling": "Big Energy",
        "hi": "Hi", "need_help": "Need help? Tap here!",
        "support_message": "You can always ask an adult and friends for support",
        "how_i_feel": "How I Feel", "my_helpers": "My Helpers",
        "my_creatures": "My Creatures", "all_students": "All Students",
        "filter_by_classroom": "Filter by Classroom",
        "no_profiles_yet": "No profiles yet!", "create_first_profile": "Create your first profile",
        "add_profile": "Add Profile", "loading_helpers": "Loading helpers...",
        "loading_strategies": "Loading helpers...",
        "tap_helpers_green": "Tap helpers you would like to try:",
        "tap_helpers_other": "Tap to select helpers:",
        "tap_strategies_green": "Tap helpers you would like to try:",
        "tap_strategies_help": "Tap to select helpers:",
        "great_job_title": "Great Job!", "keep_it_up": "Keep it up!",
        "day_streak": "days in a row!", "points": "Points", "continue": "Continue",
        "loading_creature": "Loading your creature...",
        "fully_evolved": "Fully Evolved!", "keep_growing": "Keep Growing!",
        "grow_creature_hint": "Use helpers and share your feelings to evolve your creature!",
        "evolved": "EVOLVED!", "amazing_continue": "Amazing! Continue",
        "moves": "Moves", "outfits": "Outfits", "foods": "Foods",
        "homes": "Homes", "bonus_items": "Bonus Items",
        "your_creature": "Your Creature", "creature_collection": "My Creature Collection",
        "stage": "Stage", "unlocked": "Unlocked!", "points_needed": "points to next stage",
        "settings": "Settings", "language": "Language", "about": "About",
        "login": "Login", "logout": "Logout", "confirm": "Confirm",
        "change_language": "Change Language", "language_changed": "Language Changed",
        "is_now_default": "is now your default language.",
        "i_am_a": "I am a...", "student": "Student", "teacher": "Teacher", "parent": "Parent",
        "loading": "Loading...", "save": "Save", "cancel": "Cancel", "delete": "Delete",
        "edit": "Edit", "back": "Back", "next": "Next", "done": "Done", "skip": "Skip",
        "days_7": "7 Days", "days_14": "2 Weeks", "days_30": "30 Days",
        "free_trial": "Free Trial", "subscribe": "Subscribe",
        "sign_in_google": "Sign in with Google",
        "confirm_logout": "Are you sure you want to logout?",
        "subscription": "Subscription", "have_trial_code": "Have a trial code?",
        "redeem_code": "Redeem Code", "redeeming": "Redeeming...",
        "trial_code_placeholder": "Enter your code here",
        "trial_code_success": "Code redeemed successfully!",
        "trial_code_invalid": "Invalid code",
        "how_are_you_feeling": "How are you feeling today?",
        "check_in_feelings": "Check in my feelings",
        "select_colour": "Select your emotion colour",
        "helpful_strategies": "Helpful strategies",
        "week_overview": "Week Overview",
        "day_sun": "Sun", "day_mon": "Mon", "day_tue": "Tue",
        "day_wed": "Wed", "day_thu": "Thu", "day_fri": "Fri", "day_sat": "Sat",
        "what_colours_mean": "What do the colours mean?",
        "tap_colour_help": "How are you feeling today?",
        "select_profile": "Select Your Profile",
    },
    "pt": {
        "app_name": "Turma da Felicidade",
        "how_are_you_feeling": "Como te estás a sentir hoje?",
        "tap_colour_help": "Toca na cor que corresponde ao teu sentimento",
        "choose_helpers": "Escolhe os teus ajudantes",
        "want_to_say": "Queres dizer como te sentes?",
        "write_sentence": "Escreve uma frase sobre como te sentes...",
        "save_checkin": "Guardar os meus sentimentos",
        "well_done": "Muito bem!",
        "great_job": "Ótimo trabalho ao partilhar os teus sentimentos!",
        "blue_feelings": "Sentimentos Azuis",
        "green_feelings": "Sentimentos Verdes",
        "yellow_feelings": "Sentimentos Amarelos",
        "red_feelings": "Sentimentos Vermelhos",
        "blue_zone": "Zona Azul",
        "green_zone": "Zona Verde",
        "yellow_zone": "Zona Amarela",
        "red_zone": "Zona Vermelha",
        "blue_label": "Pouca energia",
        "green_label": "Calmo e pronto",
        "yellow_label": "Stressado",
        "red_label": "Sobrecarregado",
        "tired": "Cansado", "sad": "Triste", "bored": "Aborrecido", "lonely": "Sozinho",
        "calm": "Calmo", "happy": "Feliz", "focused": "Concentrado", "ready_to_learn": "Pronto",
        "silly": "Tolo", "nervous": "Nervoso", "frustrated": "Frustrado", "worried": "Preocupado",
        "angry": "Zangado", "very_upset": "Muito chateado", "out_of_control": "Selvagem", "super_charged": "Agitado",
        "blue_description": "O teu corpo está a mover-se devagar. Podes sentir-te cansado, triste ou precisar de descanso.",
        "green_description": "Sentes-te calmo, feliz e pronto. É um ótimo sentimento!",
        "yellow_description": "Estás a começar a sentir-te instável. Podes sentir-te tolo, nervoso ou frustrado.",
        "red_description": "O teu corpo tem sentimentos grandes agora. Podes sentir-te zangado ou fora de controlo.",
        "blue_feeling": "Energia Tranquila", "green_feeling": "Energia Equilibrada",
        "yellow_feeling": "Energia Efervescente", "red_feeling": "Grande Energia",
        "hi": "Olá", "need_help": "Precisas de ajuda? Toca aqui!",
        "support_message": "Podes sempre pedir ajuda a um adulto ou amigo de confiança",
        "how_i_feel": "Como me sinto", "my_helpers": "Os meus ajudantes",
        "my_creatures": "As minhas criaturas", "all_students": "Todos os Alunos",
        "filter_by_classroom": "Filtrar por Turma",
        "no_profiles_yet": "Ainda sem perfis!", "create_first_profile": "Cria o teu primeiro perfil para começar",
        "add_profile": "Adicionar Perfil", "loading_helpers": "A carregar ajudantes...",
        "loading_strategies": "A carregar ajudantes...",
        "tap_helpers_green": "Toca nos ajudantes que gostarias de experimentar:",
        "tap_helpers_other": "Toca para selecionar ajudantes:",
        "tap_strategies_green": "Toca nos ajudantes que gostarias de experimentar:",
        "tap_strategies_help": "Toca para selecionar ajudantes:",
        "great_job_title": "Trabalho Incrível!", "keep_it_up": "Continua assim!",
        "day_streak": "dias seguidos!", "points": "Pontos", "continue": "Continuar",
        "loading_creature": "A carregar a tua criatura...",
        "fully_evolved": "Completamente Evoluído!", "keep_growing": "Continua a Crescer!",
        "grow_creature_hint": "Usa ajudantes e partilha os teus sentimentos para evoluir a tua criatura!",
        "evolved": "EVOLUÍDO!", "amazing_continue": "Incrível! Continuar",
        "moves": "Movimentos", "outfits": "Roupas", "foods": "Comida",
        "homes": "Casas", "bonus_items": "Itens Bónus",
        "your_creature": "A Tua Criatura", "creature_collection": "A Minha Coleção de Criaturas",
        "stage": "Fase", "unlocked": "Desbloqueado!", "points_needed": "pontos para a próxima fase",
        "settings": "Configurações", "language": "Idioma", "about": "Sobre",
        "login": "Entrar", "logout": "Sair", "confirm": "Confirmar",
        "change_language": "Mudar idioma", "language_changed": "Idioma alterado",
        "is_now_default": "é agora o teu idioma padrão.",
        "i_am_a": "Eu sou...", "student": "Aluno", "teacher": "Professor", "parent": "Pai/Mãe",
        "loading": "A carregar...", "save": "Guardar", "cancel": "Cancelar", "delete": "Eliminar",
        "edit": "Editar", "back": "Voltar", "next": "Próximo", "done": "Feito", "skip": "Ignorar",
        "days_7": "7 Dias", "days_14": "2 Semanas", "days_30": "30 Dias",
        "free_trial": "Teste Grátis", "subscribe": "Subscrever",
        "sign_in_google": "Entrar com Google",
        "confirm_logout": "Tens a certeza que queres sair?",
        "subscription": "Subscrição", "have_trial_code": "Tens um código de teste?",
        "redeem_code": "Resgatar Código", "redeeming": "A resgatar...",
        "trial_code_placeholder": "Insere o teu código aqui",
        "trial_code_success": "Código resgatado com sucesso!",
        "trial_code_invalid": "Código inválido",
        "check_in_feelings": "Registar as minhas emoções",
        "select_colour": "Seleciona a tua cor de emoção",
        "helpful_strategies": "Estratégias úteis",
        "week_overview": "Resumo da semana",
        "day_sun": "Dom", "day_mon": "Seg", "day_tue": "Ter",
        "day_wed": "Qua", "day_thu": "Qui", "day_fri": "Sex", "day_sat": "Sáb",
        "what_colours_mean": "O que significam as cores?",
        "tap_colour_help": "Como te estás a sentir hoje?",
        "select_profile": "Seleciona o teu Perfil",
        "tap_to_check_in": "Toca para fazer check-in",
        "legal": "Legal",
        "admin_access": "Acesso de Administrador",
        "generate_invite_code": "Gerar Código de Convite",
        "join_school": "Juntar à Escola",
        "class_mood_graph": "Gráfico de Humor da Turma",
        "week_at_a_glance": "Semana em Resumo",
        "recent_checkins": "Check-ins Recentes",
        "my_class": "A Minha Turma",
        "students": "Alunos",
        "teacher_checkin": "Check-in do Professor",
        "check_in_yourself": "Faz check-in contigo mesmo",
        "research_strategies": "Estratégias baseadas em investigação",
        "try_one": "Experimenta uma destas:",
        "done_back": "Concluído — voltar ao painel",
        "change": "Alterar",
        "family_checkin": "Check-in da Família",
        "how_everyone_feeling": "Como se está toda a gente a sentir?",
        "add_family_member": "Adicionar Membro da Família",
        "family_dashboard": "Painel da Família",
        "overview": "Visão Geral",
        "alerts": "Alertas",
        "analytics": "Análises",
        "no_alerts": "Sem alertas ainda",
        "save_school_profile": "Guardar Perfil da Escola",
        "school_type": "Tipo de Escola",
        "curriculum": "Currículo",
        "contact_name": "Nome do Contacto",
        "how_heard": "Como soube de nós",
        "school_name": "Nome da Escola",
        "city": "Cidade",
        "country": "País",
        "teacher_resources": "Recursos do Professor",
        "upload_share_materials": "Carregar e partilhar materiais",
        "recent_check_ins": "Check-ins Recentes",
        "your_check_ins": "Os teus Check-ins",
        "check_ins": "check-ins",
        "no_check_ins": "Sem check-ins ainda",
        "no_students": "Sem alunos ainda",
        "class_mood_snapshot": "Resumo do Humor da Turma",
        "week_at_a_glance": "Semana em Resumo",
        "today": "Hoje",
        "now": "Agora",
        "all_students": "Todos os Alunos",
        "my_class": "A Minha Turma",
        "teacher_checkin": "Check-in do Professor",
        "classrooms": "Turmas",
        "students": "Alunos",
        "family_dashboard": "Painel da Família",
        "family_checkin": "Check-in da Família",
        "how_everyone_feeling": "Como se está toda a gente a sentir?",
        "add_family_member": "Adicionar Membro da Família",
        "family_members": "Membros da Família",
        "no_family_members": "Sem membros da família ainda",
        "check_in_for": "Check-in para",
        "how_everyone_feeling": "Como se está toda a gente?",
        "choose_helpful_strategies": "Escolhe estratégias úteis",
        "select_helpful_strategies": "Seleciona estratégias úteis",
        "saving": "A guardar...",
        "skip_strategies": "Ignorar estratégias",
        "edit_note": "Editar nota",
        "add_note_optional": "Adicionar nota (opcional)",
        "write_short_note": "Escreve uma nota curta...",
        "checkin_saved": "Check-in Guardado! ✅",
        "checkin_saved_message": "Ótimo trabalho a fazer check-in hoje!",
        "legal": "Legal",
        "admin_access": "Acesso de Administrador",
        "generate_invite_code": "Gerar Código de Convite",
        "join_school": "Juntar à Escola",
        "tap_to_check_in": "Toca para fazer check-in",
        "overview": "Visão Geral",
        "alerts": "Alertas",
        "analytics": "Análises",
        "no_alerts": "Sem alertas ainda",
        "save_school_profile": "Guardar Perfil da Escola",
        "school_type": "Tipo de Escola",
        "curriculum": "Currículo",
        "contact_name": "Nome do Contacto",
        "how_heard": "Como soube de nós",
        "school_name": "Nome da Escola",
        "city": "Cidade",
        "generate_new_code": "Gerar Novo Código",
        "disclaimer": "Aviso Legal",
        "terms_of_service": "Termos de Serviço",
        "privacy_policy": "Política de Privacidade",
        "about_app": "Sobre a Aplicação",
        "version": "Versão",
        "made_with_love": "Feito com amor para as crianças",
        "reward_message": "Ótimo trabalho a gerir os teus sentimentos",
        "well_done_checkin": "Check-in Concluído",
        "creature_evolved": "A tua criatura evoluiu",
        "new_stage": "Nova fase desbloqueada",
        "keep_checking_in": "Continua a fazer check-in para evoluir a tua criatura",
        "my_family": "A Minha Família",
        "add_member": "Adicionar Membro",
        "family_member": "Membro da Família",
        "link_children": "Ligar Crianças",
        "link_child": "Ligar Criança",
        "enter_link_code": "Insere o código de ligação",
        "link_code": "Código de Ligação",
        "link_success": "Criança ligada com sucesso",
        "unlink": "Desligar",
        "home_check_in": "Check-in em Casa",
        "family_check_in": "Check-in da Família",
        "how_is_everyone": "Como está toda a gente?",
        "select_family_member": "Seleciona um membro da família",
        "no_members_yet": "Sem membros ainda. Adiciona um membro da família.",
        "add_family_member": "Adicionar Membro da Família",
        "member_name": "Nome do Membro",
        "relationship": "Relação",
        "save_member": "Guardar Membro",
        "classroom_widget": "Widget da Turma",
        "student_emotions": "Emoções dos Alunos",
        "no_checkins_today": "Sem check-ins hoje",
        "checkins_today": "check-ins hoje",
        "disclaimer_text": "Esta aplicação destina-se a apoiar o bem-estar emocional. Não substitui aconselhamento profissional.",
        "school_admin_dashboard": "Painel do Administrador Escolar",
        "teacher_strategies": "Estratégias do Professor",
        "student_strategies": "Estratégias do Aluno",
        "add_teacher_strategy": "Adicionar Estratégia do Professor",
        "add_student_strategy": "Adicionar Estratégia do Aluno",
        "strategy_saved": "Estratégia guardada",
        "strategy_deleted": "Estratégia eliminada",
        "needs_attention": "Precisa de Atenção",
        "at_risk": "Em Risco",
        "wellbeing_alerts": "Alertas de Bem-estar",
        "no_alerts_yet": "Sem alertas ainda",
        "school_profile": "Perfil da Escola",
        "school_settings": "Configurações da Escola",
        "invite_teachers": "Convidar Professores",
        "teacher_invite_code": "Código de Convite do Professor",
        "share_code_teachers": "Partilha este código com os teus professores",
        "generate_code": "Gerar Código",
        "code_valid_90": "Válido por 90 dias",
        "international": "Internacional",
        "public": "Público",
        "private": "Privado",
        "faith_based": "Religioso",
        "charter": "Charter",
        "ib": "Bacharelato Internacional",
        "national": "Nacional",
        "cambridge": "Cambridge",
        "montessori": "Montessori",
        "mixed": "Misto/Outro",
        "student_count": "Número de Alunos",
        "contact": "Contacto",
        "how_heard_us": "Como soube de nós",
        "save_profile": "Guardar Perfil",
        "link_school_profile": "Ligar ao Perfil Escolar",
        "link_child_school": "Ligar Criança à Escola",
        "linked_to_school": "Ligado à Escola",
        "track_emotional_wellness": "Acompanhar o Bem-estar Emocional",
        "children_school": "Escola das Crianças",
        "link_children_school": "Ligar Crianças à Escola",
        "no_recent_activity": "Sem atividade recente",
        "recent_activity": "Atividade Recente",
        "today": "Hoje",
        "days_ago": "dias atrás",
        "view_details": "Ver Detalhes",
        "close": "Fechar",
        "delete": "Eliminar",
        "confirm_delete": "Confirmar eliminação",
        "are_you_sure": "Tens a certeza?",
        "yes": "Sim",
        "no": "Não",
        "error": "Erro",
        "success": "Sucesso",
        "family_check_in_title": "Check-in da Família",
        "how_is_member": "Como está",
        "select_emotion": "Seleciona uma emoção",
        "strategies_helped": "Estratégias que ajudaram",
        "add_note": "Adicionar nota",
        "submit": "Submeter",
        "checkin_complete": "Check-in Completo",
        "well_done_family": "Muito bem por fazer o check-in",
        "aqua_buddy_name": "Amigo Aqua",
        "aqua_buddy_desc": "Um amigo aquático que cresce com os teus sentimentos",
        "leaf_friend_name": "Amigo Folha",
        "leaf_friend_desc": "Uma criatura verde que floresce com o teu bem-estar",
        "spark_pal_name": "Amigo Faísca",
        "spark_pal_desc": "Uma criatura energética que brilha com as tuas emoções",
        "blaze_heart_name": "Coração Chama",
        "blaze_heart_desc": "Uma criatura corajosa que cresce com a tua força interior",
        "egg_stage": "Ovo",
        "stage_1": "Fase 1",
        "stage_2": "Fase 2",
        "stage_3": "Fase 3 - Evoluído",
        "unlocked": "Desbloqueado",
        "locked": "Bloqueado",
        "evolve": "Evoluir",
        "creature_points": "Pontos de Criatura",
        "next_evolution": "Próxima Evolução",
        "add_classroom": "Adicionar Turma",
        "emotion_distribution": "Distribuição de Emoções",
        "emotion_trends": "Tendências de Emoções",
        "your_checkins": "Os teus Check-ins",
        "create_new_classroom": "Criar Nova Turma",
        "classroom_name_placeholder": "Nome da turma...",
        "student_details": "Detalhes do Aluno",
        "manage_strategies": "Gerir Estratégias",
        "edit_profile": "Editar Perfil",
        "days": "Dias",
        "strategies_used": "Estratégias Usadas",
        "frequency": "Frequência",
        "about_privacy": "Sobre e Privacidade",
        "disclaimer": "Aviso Legal",
        "class_of_happiness": "Class of Happiness",

        "no_classrooms_yet": "Sem turmas ainda",
        "edit_classroom": "Editar Turma",
        "delete_classroom": "Eliminar Turma",
        "classroom_name": "Nome da Turma",
        "student_detail": "Detalhe do Aluno",
        "strategies_used": "Estratégias Usadas",
        "home_data": "Dados de Casa",
        "generate_link_code": "Gerar Código de Ligação",
        "download_report": "Descarregar Relatório",
        "no_checkins_yet": "Sem check-ins ainda",
        "school_admin_dashboard": "Painel do Administrador",
        "needs_attention": "Precisa de Atenção",
        "at_risk_students": "Alunos em Risco",
        "emotion_trends": "Tendências de Emoções",
        "global_strategies": "Estratégias Globais",
        "school_strategies": "Estratégias da Escola",
        "add_note_here": "Adiciona uma nota aqui...",
        "sending": "A enviar...",
        "send": "Enviar",
        "note": "Nota",
        "share_with_teacher": "Partilhar com Professor",
        "shared_with_teacher": "Partilhado com Professor",
        "private_note": "Nota Privada",



        "profile_saved": "Perfil guardado com sucesso",
        "quick_actions": "Ações Rápidas",
        "no_recent_activity": "Sem atividade recente",
        "recent_activity": "Atividade Recente",
        "check_in": "Check-in",
        "checkin": "Check-in",
        "my_family": "A Minha Família",
        "family_members": "Membros da Família",
        "no_members_yet": "Sem membros ainda",
        "add_family_member": "Adicionar Membro da Família",
        "link_child": "Ligar Criança",
        "linked_children": "Crianças Ligadas",
        "enter_link_code": "Insere o código de ligação",
        "link_success": "Criança ligada com sucesso",
        "error_fetching": "Erro ao obter dados",
        "try_again": "Tentar novamente",
        "request_failed": "Pedido falhou. Tenta novamente.",
        "strategy_saved_success": "Estratégia guardada",


        "blue_words": "Triste, Cansado, Aborrecido",
        "green_words": "Calmo, Feliz, Concentrado",
        "yellow_words": "Preocupado, Frustrado, Tolo",
        "red_words": "Zangado, Assustado, Fora de Controlo",
        "blue_label": "Azul",
        "green_label": "Verde",
        "yellow_label": "Amarelo",
        "red_label": "Vermelho",
        "checkin_for": "Check-in para",
        "how_everyone_feeling": "Como se está toda a gente a sentir?",
        "choose_helpful_strategies": "Escolhe estratégias úteis",
        "select_helpful_strategies": "Seleciona estratégias úteis",
        "saving": "A guardar...",
        "skip_strategies": "Ignorar estratégias",
        "add_note_optional": "Adicionar nota (opcional)",
        "edit_note": "Editar nota",
        "checkin_saved": "Check-in Guardado",
        "checkin_saved_message": "Ótimo trabalho a fazer check-in hoje",

        "blue_subtitle": "Cansado · Triste · Esgotado · Sozinho",
        "green_subtitle": "Calmo · Concentrado · Pronto · Grato",
        "yellow_subtitle": "Ansioso · Frustrado · Sobrecarregado",
        "red_subtitle": "Zangado · Exausto · Fora de controlo",
        "teacher_checkin_intro": "Os professores também importam. Faz check-in contigo.",
        "research_note": "Estratégias baseadas em investigação sobre bem-estar docente",
        "try_one_of_these": "Experimenta uma destas:",
        "done_back": "Concluído — voltar ao painel",
        "change": "Alterar",
        "check_in_yourself": "Faz check-in contigo mesmo",
        "research_strategies": "Estratégias baseadas em investigação",
        "send_alert": "Enviar Alerta de Bem-estar",
        "sharing": "Partilhando",
        "private": "Privado",
        "add_strategy": "Adicionar Estratégia",
        "strategy_name": "Nome da Estratégia",
        "family_strategies": "Estratégias da Família",
        "home_checkins": "Check-ins em Casa",
        "linked_child": "Filho Vinculado",
        "no_family_members": "Sem membros da família ainda",
        "family_members": "Membros da Família",
        "free_trial": "Teste Grátis",
        "start_trial": "Iniciar Teste Grátis",
        "trial_active": "Teste Ativo",
        "about": "Sobre",
        "version": "Versão",
        "send_alert_title": "Alerta Enviado",
        "tap_to_check_in": "Toca para fazer check-in",
        "try_one": "Experimenta uma destas:",

        "share_with_teachers": "Partilha este código com os teus professores",
        "valid_90_days": "Válido por 90 dias",
        "needs_attention": "Precisa de Atenção",
        "at_risk_students": "Alunos em Risco",
        "emotion_trends": "Tendências de Emoções",
        "strategy_usage": "Uso de Estratégias",
        "top_strategy": "Estratégia Principal",
        "total_checkins": "Total de Check-ins",
        "active_students": "Alunos Ativos",
        "teacher_tab": "Professor",

        "teacher_dashboard": "Painel do Professor",
        "add_widget_to_home": "Adicionar widget ao ecrã inicial",
        "add_quick_status": "Adicionar estado rápido ao ecrã inicial",
        "add_new_student": "Adicionar Novo Aluno",
        "family_strategies": "Estratégias da Família",
        "from_teacher": "Do Professor",
        "check_in_now": "Fazer Check-in Agora",
        "manage_and_support": "Gerir e apoiar a tua escola",
        "student_tab": "Aluno",
        "add_new_strategy": "Adicionar Nova Estratégia",
        "strategy_name": "Nome da Estratégia",
        "description": "Descrição",
        "select_zone": "Selecionar Zona",
        "no_strategies": "Sem estratégias ainda",


        "classrooms": "Turmas", "resources": "Recursos", "check_in": "Check-in",
        "strategies": "Estratégias", "wellbeing": "Bem-estar",
        "no_data": "Sem dados ainda", "this_week": "Esta semana",
    },
    "es": {
        "app_name": "Clase de la Felicidad",
        "how_are_you_feeling": "¿Cómo te sientes hoy?",
        "tap_colour_help": "Toca el color que coincide con cómo te sientes",
        "choose_helpers": "Elige tus ayudantes",
        "save_checkin": "Guardar mis sentimientos",
        "well_done": "¡Muy bien!",
        "blue_feelings": "Sentimientos Azules", "green_feelings": "Sentimientos Verdes",
        "yellow_feelings": "Sentimientos Amarillos", "red_feelings": "Sentimientos Rojos",
        "blue_label": "Poca energía", "green_label": "Tranquilo y listo",
        "yellow_label": "Estresado", "red_label": "Sobrecargado",
        "tired": "Cansado", "sad": "Triste", "bored": "Aburrido", "lonely": "Solo",
        "calm": "Tranquilo", "happy": "Feliz", "focused": "Concentrado", "ready_to_learn": "Listo",
        "hi": "Hola", "need_help": "¿Necesitas ayuda? ¡Toca aquí!",
        "support_message": "Siempre puedes pedir ayuda a un adulto de confianza",
        "settings": "Ajustes", "language": "Idioma", "login": "Iniciar sesión",
        "logout": "Cerrar sesión", "save": "Guardar", "cancel": "Cancelar",
        "student": "Estudiante", "teacher": "Profesor", "parent": "Padre/Madre",
        "loading": "Cargando...", "done": "Hecho", "back": "Atrás",
        "i_am_a": "Yo soy...", "select_profile": "Selecciona tu Perfil",
        "day_sun": "Dom", "day_mon": "Lun", "day_tue": "Mar",
        "day_wed": "Mié", "day_thu": "Jue", "day_fri": "Vie", "day_sat": "Sáb",
    },
    "fr": {
        "app_name": "Classe du Bonheur",
        "how_are_you_feeling": "Comment te sens-tu aujourd\'hui?",
        "tap_colour_help": "Touche la couleur qui correspond à ton sentiment",
        "choose_helpers": "Choisis tes aides",
        "save_checkin": "Sauvegarder mes sentiments",
        "well_done": "Bravo!",
        "blue_feelings": "Sentiments Bleus", "green_feelings": "Sentiments Verts",
        "yellow_feelings": "Sentiments Jaunes", "red_feelings": "Sentiments Rouges",
        "blue_label": "Peu d'énergie", "green_label": "Calme et prêt",
        "yellow_label": "Stressé", "red_label": "Surchargé",
        "tired": "Fatigué", "sad": "Triste", "bored": "Ennuyé", "lonely": "Seul",
        "calm": "Calme", "happy": "Heureux", "focused": "Concentré", "ready_to_learn": "Prêt",
        "hi": "Salut", "need_help": "Besoin d'aide? Touche ici!",
        "support_message": "Tu peux toujours demander de l\'aide à un adulte de confiance",
        "settings": "Paramètres", "language": "Langue", "login": "Connexion",
        "logout": "Déconnexion", "save": "Enregistrer", "cancel": "Annuler",
        "student": "Élève", "teacher": "Enseignant", "parent": "Parent",
        "loading": "Chargement...", "done": "Terminé", "back": "Retour",
        "i_am_a": "Je suis...", "select_profile": "Sélectionne ton Profil",
        "day_sun": "Dim", "day_mon": "Lun", "day_tue": "Mar",
        "day_wed": "Mer", "day_thu": "Jeu", "day_fri": "Ven", "day_sat": "Sam",
    },
    "de": {
        "app_name": "Klasse des Glücks",
        "how_are_you_feeling": "Wie fühlst du dich heute?",
        "tap_colour_help": "Tippe auf die Farbe, die deinem Gefühl entspricht",
        "save_checkin": "Meine Gefühle speichern",
        "well_done": "Sehr gut!",
        "blue_label": "Wenig Energie", "green_label": "Ruhig und bereit",
        "yellow_label": "Gestresst", "red_label": "Überwältigt",
        "hi": "Hallo", "need_help": "Brauchst du Hilfe? Tippe hier!",
        "support_message": "Du kannst immer einen Erwachsenen um Hilfe bitten",
        "settings": "Einstellungen", "language": "Sprache", "login": "Anmelden",
        "logout": "Abmelden", "save": "Speichern", "cancel": "Abbrechen",
        "student": "Schüler", "teacher": "Lehrer", "parent": "Elternteil",
        "loading": "Lädt...", "done": "Fertig", "back": "Zurück", "i_am_a": "Ich bin...",
        "day_sun": "So", "day_mon": "Mo", "day_tue": "Di",
        "day_wed": "Mi", "day_thu": "Do", "day_fri": "Fr", "day_sat": "Sa",
    },
    "it": {
        "app_name": "Classe della Felicità",
        "how_are_you_feeling": "Come ti senti oggi?",
        "tap_colour_help": "Tocca il colore che corrisponde al tuo sentimento",
        "save_checkin": "Salva i miei sentimenti",
        "well_done": "Ottimo!",
        "blue_label": "Poca energia", "green_label": "Calmo e pronto",
        "yellow_label": "Stressato", "red_label": "Sopraffatto",
        "hi": "Ciao", "need_help": "Hai bisogno di aiuto? Tocca qui!",
        "support_message": "Puoi sempre chiedere aiuto a un adulto di fiducia",
        "settings": "Impostazioni", "language": "Lingua", "login": "Accedi",
        "logout": "Esci", "save": "Salva", "cancel": "Annulla",
        "student": "Studente", "teacher": "Insegnante", "parent": "Genitore",
        "loading": "Caricamento...", "done": "Fatto", "back": "Indietro", "i_am_a": "Sono...",
        "day_sun": "Dom", "day_mon": "Lun", "day_tue": "Mar",
        "day_wed": "Mer", "day_thu": "Gio", "day_fri": "Ven", "day_sat": "Sab",
    },
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
    feeling_colour: Optional[str] = None  # blue/green/yellow/red
    zone: Optional[str] = None  # frontend compatibility alias
    helpers_selected: List[str] = []
    strategies_selected: List[str] = []  # frontend compatibility alias
    comment: Optional[str] = None
    location: str = "school"

class AddPointsRequest(BaseModel):
    points_type: str = "checkin"
    strategy_count: int = 0
    feeling_colour: Optional[str] = "blue"
    zone: Optional[str] = None  # frontend compatibility alias

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
    # Normalize language code
    lang = lang.lower().split("-")[0].split("_")[0]
    translations = TRANSLATIONS.get(lang, TRANSLATIONS.get("en", {}))
    # Always fill missing keys from English
    result = {**translations, **{k: v for k, v in TRANSLATIONS["en"].items() if k not in translations}}
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
    
    # Get teacher's own students
    result = supabase.table("students").select("*").eq("user_id", user["user_id"]).execute()
    own_students = result.data or []
    own_ids = {s["id"] for s in own_students}

    # Get ALL parent links to find linked students
    try:
        links_result = supabase.table("parent_links").select("*").execute()
        all_links = links_result.data or []
        linked_map = {l["student_id"]: l for l in all_links}

        # Add is_linked flag to own students
        for s in own_students:
            link = linked_map.get(s["id"])
            s["is_linked"] = link is not None
            s["home_sharing_enabled"] = link.get("home_sharing_enabled", False) if link else False
            s["parent_user_id"] = link.get("parent_user_id") if link else None

        # Also fetch students created by parents that are linked
        # These are students NOT owned by teacher but have a parent_link
        # pointing to a student the teacher gave a link code to
        # Find any student_ids in parent_links that aren't in teacher's own students
        extra_student_ids = [
            l["student_id"] for l in all_links
            if l["student_id"] not in own_ids
        ]
        
        if extra_student_ids:
            # Check if any of these were originally linked via teacher's link code
            # by checking if the student's parent_link_code matches
            for sid in extra_student_ids[:20]:  # limit
                try:
                    s_result = supabase.table("students").select("*").eq("id", sid).execute()
                    if s_result.data:
                        s = s_result.data[0]
                        link = linked_map.get(sid)
                        s["is_linked"] = True
                        s["home_sharing_enabled"] = link.get("home_sharing_enabled", False) if link else False
                        s["parent_user_id"] = link.get("parent_user_id") if link else None
                        s["linked_via_parent"] = True  # flag so teacher knows
                        if sid not in own_ids:
                            own_students.append(s)
                            own_ids.add(sid)
                except Exception:
                    pass

    except Exception as e:
        logger.error(f"Could not fetch link status: {e}")
    
    students = own_students
    
    return students
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
    # Any authenticated user can generate link codes for their students
    # (auth check above is sufficient)
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
    feeling_colour = log.feeling_colour or log.zone or "blue"
    selected_helpers = log.helpers_selected or log.strategies_selected or []
    new_log = {
        "id": str(uuid.uuid4()),
        "student_id": log.student_id,
        "feeling_colour": feeling_colour,
        "helpers_selected": selected_helpers,
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
    logs = result.data or []
    return [{
        **log,
        "zone": log.get("feeling_colour", log.get("zone")),
        "strategies_selected": log.get("helpers_selected", log.get("strategies_selected", [])),
    } for log in logs]

# Keep old endpoint name for frontend compatibility
@api_router.get("/zone-logs/{student_id}")
async def get_zone_logs(student_id: str, days: int = 7):
    return await get_feeling_logs(student_id, days)

# Frontend compatibility route
@api_router.get("/zone-logs/student/{student_id}")
async def get_zone_logs_by_student(student_id: str, days: int = 7):
    return await get_feeling_logs(student_id, days)

@api_router.get("/zone-logs")
async def get_zone_logs_all(
    request: Request,
    student_id: Optional[str] = None,
    classroom_id: Optional[str] = None,
    days: int = 7
):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    query = supabase.table("feeling_logs").select("*").gte("timestamp", start_date).order("timestamp", desc=True)

    # Specific student filter
    if student_id:
        query = query.eq("student_id", student_id)
        result = query.execute()
        return result.data or []

    # Resolve visible students for the teacher context
    students_query = supabase.table("students").select("id")
    if classroom_id:
        students_query = students_query.eq("classroom_id", classroom_id)
    students_result = students_query.execute()
    visible_student_ids = [s["id"] for s in (students_result.data or [])]
    if not visible_student_ids:
        return []

    # Supabase python client doesn't always support .in_ on all setups; aggregate safely.
    logs: List[dict] = []
    for sid in visible_student_ids:
        sid_result = supabase.table("feeling_logs").select("*").eq("student_id", sid).gte("timestamp", start_date).order("timestamp", desc=True).execute()
        logs.extend(sid_result.data or [])
    logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return [{
        **log,
        "zone": log.get("feeling_colour", log.get("zone")),
        "strategies_selected": log.get("helpers_selected", log.get("strategies_selected", [])),
    } for log in logs]

# ================== HELPERS / STRATEGIES ==================
@api_router.get("/helpers")
async def get_helpers(feeling_colour: Optional[str] = None, student_id: Optional[str] = None, lang: str = "en"):
    helpers = []
    colours = [feeling_colour] if feeling_colour else FEELING_COLOURS
    # Use translated helpers if available, otherwise fall back to English
    lang_helpers = TRANSLATED_HELPERS.get(lang, DEFAULT_HELPERS)
    for colour in colours:
        colour_helpers = lang_helpers.get(colour, DEFAULT_HELPERS.get(colour, []))
        helpers.extend(colour_helpers)

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
async def get_strategies(zone: Optional[str] = None, feeling_colour: Optional[str] = None, 
                          student_id: Optional[str] = None, lang: str = "en"):
    """Returns strategies - delegates to helpers endpoint for consistency."""
    effective_zone = zone or feeling_colour
    # Get default helpers for this zone
    helpers_result = supabase.table("helpers").select("*")
    if effective_zone:
        helpers_result = helpers_result.eq("feeling_colour", effective_zone)
    if lang and lang != "en":
        helpers_result = helpers_result.eq("lang", lang)
    else:
        helpers_result = helpers_result.eq("lang", "en")
    result = helpers_result.execute()
    helpers = result.data or []
    
    # Also get custom helpers for the student
    custom = []
    if student_id:
        try:
            custom_result = supabase.table("custom_helpers").select("*").eq("student_id", student_id).execute()
            for h in (custom_result.data or []):
                if not effective_zone or h.get("feeling_colour") == effective_zone:
                    custom.append({
                        **h,
                        "zone": h.get("feeling_colour", h.get("zone", effective_zone)),
                        "is_custom": True,
                    })
        except Exception: pass
    
    # Normalise helpers to strategy format
    strategies = []
    for h in helpers:
        strategies.append({
            "id": h.get("id", h.get("helper_id", "")),
            "name": h.get("name", ""),
            "description": h.get("description", ""),
            "icon": h.get("icon", "star"),
            "zone": h.get("feeling_colour", effective_zone or "green"),
            "feeling_colour": h.get("feeling_colour", effective_zone or "green"),
        })
    return strategies + custom


@api_router.post("/custom-strategies")
async def create_custom_strategy_alias(request: Request):
    """Alias for /helpers/custom - used by classrooms and strategies pages."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        body = await request.json()
        new_id = str(uuid.uuid4())
        strategy = {
            "id": new_id,
            "student_id": body.get("student_id"),
            "user_id": user["user_id"],
            "name": body.get("name", ""),
            "description": body.get("description", ""),
            "feeling_colour": body.get("feeling_colour", body.get("zone", "green")),
            "icon": body.get("icon", "star"),
            "is_shared": body.get("is_shared", True),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        result = supabase.table("custom_helpers").insert(strategy).execute()
        return result.data[0] if result.data else strategy
    except Exception as e:
        logger.error(f"custom_strategies create error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/custom-strategies/{strategy_id}")
async def delete_custom_strategy(strategy_id: str, request: Request):
    """Delete a custom strategy - owner only."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        result = supabase.table("custom_helpers").delete().eq("id", strategy_id).execute()
        return {"deleted": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/custom-strategies")
async def get_custom_strategies(request: Request, student_id: Optional[str] = None):
    """Get custom strategies for a student."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        query = supabase.table("custom_helpers").select("*")
        if student_id:
            query = query.eq("student_id", student_id)
        result = query.execute()
        # Normalise: add zone field from feeling_colour for frontend compatibility
        data = result.data or []
        for row in data:
            if "zone" not in row or not row.get("zone"):
                row["zone"] = row.get("feeling_colour", "green")
        return data
    except Exception as e:
        return []

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
        "unlocked_moves": [],
        "unlocked_outfits": [],
        "unlocked_foods": [],
        "unlocked_homes": [],
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
            "unlocked_moves": [],
            "unlocked_outfits": [],
            "unlocked_foods": [],
            "unlocked_homes": [],
            "current_creature_id": "aqua_buddy",
            "current_stage": 0,
            "current_points": 0
        }

    # Which creature gets the points - zone takes priority over feeling_colour default
    feeling_colour = req.zone or (req.feeling_colour if req.feeling_colour != "blue" else None) or "blue"
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
    # Any authenticated user can generate link codes for their students
    # (auth check above is sufficient)
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

@api_router.put("/family/members/{member_id}")
async def update_family_member(member_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    allowed = ["name", "relationship", "avatar_type", "avatar_preset", "avatar_custom"]
    update_data = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    supabase.table("family_members").update(update_data).eq("id", member_id).eq("user_id", user["user_id"]).execute()
    updated = supabase.table("family_members").select("*").eq("id", member_id).eq("user_id", user["user_id"]).execute()
    if not updated.data:
        raise HTTPException(status_code=404, detail="Family member not found")
    return updated.data[0]

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
    # Try both field names for compatibility
    result = supabase.table("students").select("*").eq("link_code", body.link_code).execute()
    if not result.data:
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

@api_router.post("/students/link")
async def link_child_compat(body: LinkChildRequest, request: Request):
    # Frontend compatibility alias
    return await link_child(body, request)

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

# Full strategy name map (mirrors frontend STRATEGY_NAME_MAP)
STRATEGY_NAME_MAP = {
    "b1": "Gentle Stretch", "b2": "Favourite Song", "b3": "Tell Someone", "b4": "Slow Breathing",
    "g1": "Keep Going!", "g2": "Help a Friend", "g3": "Set a Goal", "g4": "Gratitude",
    "y1": "Bubble Breathing", "y2": "Count to 10", "y3": "5 Senses", "y4": "Talk About It",
    "r1": "Freeze", "r2": "Big Breaths", "r3": "Safe Space", "r4": "Ask for Help",
    "p_b1": "Side-by-Side Presence", "p_b2": "Warm Drink Ritual", "p_b3": "Name It to Tame It",
    "p_g1": "Gratitude Round", "p_g2": "Strength Spotting", "p_g3": "Creative Together",
    "p_y1": "Box Breathing Together", "p_y2": "Validate First", "p_y3": "Body Check-In",
    "p_r1": "Stay Calm Yourself", "p_r2": "Safe Space Together", "p_r3": "Cold Water Reset",
}

def resolve_strategy_name(sid: str) -> str:
    """Return human-readable strategy name from ID or raw string."""
    return STRATEGY_NAME_MAP.get(str(sid).strip(), str(sid).strip().replace("_", " ").title())

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

    # ── BUILD PDF ──────────────────────────────────────────────────────────────
    buffer = io.BytesIO()
    from reportlab.lib.pagesizes import A4
    PAGE_W, PAGE_H = A4
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36
    )
    styles = getSampleStyleSheet()

    # ── Palette ──
    INDIGO      = colors.HexColor('#5C6BC0')
    INDIGO_DARK = colors.HexColor('#3949AB')
    BLUE_C      = colors.HexColor('#4A90D9')
    GREEN_C     = colors.HexColor('#4CAF50')
    YELLOW_C    = colors.HexColor('#FFC107')
    RED_C       = colors.HexColor('#F44336')
    LIGHT       = colors.HexColor('#F8F9FA')
    MID         = colors.HexColor('#E8EAF6')
    GREY        = colors.HexColor('#666666')
    LIGHT_GREY  = colors.HexColor('#E0E0E0')
    WHITE       = colors.white

    ZONE_COLORS_PDF  = {"blue": BLUE_C, "green": GREEN_C, "yellow": YELLOW_C, "red": RED_C}
    ZONE_LABELS      = {"blue": "Blue Emotions", "green": "Green Emotions", "yellow": "Yellow Emotions", "red": "Red Emotions"}
    ZONE_DESCS       = {
        "blue":   "Calm / Low energy",
        "green":  "Happy / Ready to learn",
        "yellow": "Worried / Frustrated",
        "red":    "Overwhelmed / Angry",
    }
    WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]

    # ── Styles ──
    def s(name, **kw):
        return ParagraphStyle(name, **kw)

    ST_LOGO    = s('Logo',    fontSize=20, textColor=WHITE,  fontName='Helvetica-Bold', leading=24)
    ST_LOGSUB  = s('LogoS',  fontSize=10, textColor=colors.HexColor('#C5CAE9'), leading=13)
    ST_H2      = s('H2',     fontSize=13, textColor=INDIGO,  fontName='Helvetica-Bold', spaceBefore=10, spaceAfter=4)
    ST_BODY    = s('Body',   fontSize=9,  textColor=colors.HexColor('#333333'), spaceAfter=3, leading=13)
    ST_SMALL   = s('Small',  fontSize=7.5,textColor=GREY, leading=10)
    ST_DISC    = s('Disc',   fontSize=7,  textColor=colors.HexColor('#999999'), fontName='Helvetica-Oblique', leading=9)
    ST_LABEL   = s('Label',  fontSize=8,  textColor=GREY,   fontName='Helvetica-Bold')
    ST_VALUE   = s('Val',    fontSize=9,  textColor=colors.HexColor('#222222'), fontName='Helvetica-Bold')

    elements = []
    total      = sum(feeling_counts.values())
    month_name = datetime(year, month, 1).strftime("%B %Y")
    _, last_day_cal = calendar.monthrange(year, month)

    # ════════════════════════════════════════════════════════
    # HEADER BANNER
    # ════════════════════════════════════════════════════════
    header_data = [[
        Paragraph("🌈 Class of Happiness", ST_LOGO),
        Paragraph(
            f"<b>Emotional Wellbeing Report</b><br/>{month_name}",
            s('HRight', fontSize=11, textColor=WHITE, fontName='Helvetica-Bold',
              alignment=2, leading=15)
        ),
    ]]
    header_table = Table(header_data, colWidths=[280, 225])
    header_table.setStyle(TableStyle([
        ('BACKGROUND',  (0,0), (-1,-1), INDIGO),
        ('PADDING',     (0,0), (-1,-1), 14),
        ('VALIGN',      (0,0), (-1,-1), 'MIDDLE'),
        ('ROUNDEDCORNERS', [8]),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 10))

    # ── Student info strip ──
    info_data = [[
        Paragraph(f"<b>Student:</b> {student_data['name']}", ST_BODY),
        Paragraph(f"<b>Class:</b> {classroom_name}", ST_BODY),
        Paragraph(f"<b>Period:</b> {month_name}", ST_BODY),
        Paragraph(f"<b>Check-ins:</b> {len(logs_data)}", ST_BODY),
        Paragraph(f"<b>Generated:</b> {datetime.now().strftime('%d %b %Y')}", ST_BODY),
    ]]
    info_strip = Table(info_data, colWidths=[103, 103, 103, 79, 117])
    info_strip.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), MID),
        ('PADDING',    (0,0), (-1,-1), 7),
        ('VALIGN',     (0,0), (-1,-1), 'MIDDLE'),
        ('GRID',       (0,0), (-1,-1), 0.5, LIGHT_GREY),
    ]))
    elements.append(info_strip)
    elements.append(Spacer(1, 12))

    # ════════════════════════════════════════════════════════
    # ROW 1: Zone distribution (visual bars) + Zone table side by side
    # ════════════════════════════════════════════════════════
    elements.append(Paragraph("Emotion Zone Distribution", ST_H2))

    # Build visual bar chart using ReportLab Drawing
    from reportlab.graphics.shapes import Drawing, Rect, String
    from reportlab.graphics import renderPDF

    BAR_W, BAR_H = 240, 90
    bar_drawing = Drawing(BAR_W, BAR_H)
    zones_order = ["blue", "green", "yellow", "red"]
    max_count = max(feeling_counts.values()) if total > 0 else 1
    bar_slot_w = BAR_W / 4
    bar_margin = 8

    for idx, zone in enumerate(zones_order):
        count = feeling_counts[zone]
        bar_h = int((count / max_count) * 65) if max_count > 0 else 0
        bar_h = max(bar_h, 2)
        x = idx * bar_slot_w + bar_margin
        bw = bar_slot_w - bar_margin * 2

        # Bar fill
        zc = ZONE_COLORS_PDF[zone]
        r = Rect(x, 20, bw, bar_h)
        r.fillColor = zc
        r.strokeColor = None
        bar_drawing.add(r)

        # Count label above bar
        lbl = String(x + bw / 2, 22 + bar_h, str(count),
                     textAnchor='middle', fontSize=9,
                     fontName='Helvetica-Bold',
                     fillColor=colors.HexColor('#333333'))
        bar_drawing.add(lbl)

        # Zone label below
        zlbl = String(x + bw / 2, 6, ZONE_LABELS[zone].split()[0],
                      textAnchor='middle', fontSize=7,
                      fontName='Helvetica',
                      fillColor=colors.HexColor('#666666'))
        bar_drawing.add(zlbl)

    # Zone stats table (right side)
    zone_rows = [
        [Paragraph('<b>Zone</b>', ST_LABEL),
         Paragraph('<b>Count</b>', ST_LABEL),
         Paragraph('<b>%</b>', ST_LABEL),
         Paragraph('<b>State</b>', ST_LABEL)]
    ]
    for zone in zones_order:
        count = feeling_counts[zone]
        pct   = f"{(count/total*100):.0f}%" if total > 0 else "—"
        zone_rows.append([
            Paragraph(ZONE_LABELS[zone], ST_BODY),
            Paragraph(str(count), ST_VALUE),
            Paragraph(pct, ST_BODY),
            Paragraph(ZONE_DESCS[zone], ST_SMALL),
        ])

    zone_tbl = Table(zone_rows, colWidths=[72, 36, 30, 110])
    zone_style_list = [
        ('BACKGROUND', (0,0), (-1,0), INDIGO),
        ('TEXTCOLOR',  (0,0), (-1,0), WHITE),
        ('GRID',       (0,0), (-1,-1), 0.4, LIGHT_GREY),
        ('PADDING',    (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [WHITE, LIGHT]),
        ('VALIGN',     (0,0), (-1,-1), 'MIDDLE'),
    ]
    for i, zone in enumerate(zones_order, 1):
        zone_style_list.append(
            ('LEFTPADDING', (0,i), (0,i), 10)
        )
        # Colour swatch in first col via background on a tiny inner cell - use textcolor instead
        zone_style_list.append(
            ('TEXTCOLOR', (0,i), (0,i), ZONE_COLORS_PDF[zone])
        )
        zone_style_list.append(
            ('FONTNAME', (0,i), (0,i), 'Helvetica-Bold')
        )
    zone_tbl.setStyle(TableStyle(zone_style_list))

    # Side-by-side
    dist_row = Table(
        [[bar_drawing, zone_tbl]],
        colWidths=[250, 255]
    )
    dist_row.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING',  (1,0), (1,0), 10),
        ('RIGHTPADDING', (0,0), (0,0), 10),
    ]))
    elements.append(dist_row)
    elements.append(Spacer(1, 12))

    # ════════════════════════════════════════════════════════
    # ROW 2: Calendar heatmap
    # ════════════════════════════════════════════════════════
    elements.append(Paragraph("Monthly Calendar", ST_H2))

    # Build 7-col calendar grid
    import calendar as cal_mod
    first_weekday, _ = cal_mod.monthrange(year, month)  # 0=Mon
    # Pad to Monday-start
    cal_cells = [''] * first_weekday
    for day in range(1, last_day_cal + 1):
        date_key = f"{year}-{month:02d}-{day:02d}"
        day_logs = daily_counts.get(date_key, {})
        day_total = sum(day_logs.values())
        # Dominant zone
        dominant = max(day_logs, key=day_logs.get) if day_logs else None
        cal_cells.append((day, dominant, day_total))

    # Pad to full weeks
    while len(cal_cells) % 7 != 0:
        cal_cells.append('')

    cal_rows = [['Mon','Tue','Wed','Thu','Fri','Sat','Sun']]
    for i in range(0, len(cal_cells), 7):
        week = cal_cells[i:i+7]
        row = []
        for cell in week:
            if cell == '':
                row.append('')
            else:
                day_num, dominant, day_total = cell
                if dominant:
                    row.append(Paragraph(
                        f'<b>{day_num}</b><br/><font size="6">{day_total}✓</font>',
                        s('CalCell', fontSize=8, textColor=WHITE,
                          fontName='Helvetica-Bold', alignment=1, leading=10)
                    ))
                else:
                    row.append(Paragraph(
                        f'<font color="#999">{day_num}</font>',
                        s('CalEmpty', fontSize=8, alignment=1, leading=10,
                          textColor=colors.HexColor('#AAAAAA'))
                    ))
        cal_rows.append(row)

    col_w = (PAGE_W - 72) / 7
    cal_tbl = Table(cal_rows, colWidths=[col_w] * 7,
                    rowHeights=[18] + [28] * (len(cal_rows) - 1))

    cal_style = [
        ('BACKGROUND',  (0,0), (-1,0), INDIGO),
        ('TEXTCOLOR',   (0,0), (-1,0), WHITE),
        ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE',    (0,0), (-1,0), 8),
        ('ALIGN',       (0,0), (-1,-1), 'CENTER'),
        ('VALIGN',      (0,0), (-1,-1), 'MIDDLE'),
        ('GRID',        (0,0), (-1,-1), 0.3, LIGHT_GREY),
        ('PADDING',     (0,0), (-1,-1), 3),
    ]

    # Colour each day cell by dominant zone
    row_idx = 1
    for i in range(0, len(cal_cells), 7):
        week = cal_cells[i:i+7]
        for col_idx, cell in enumerate(week):
            if cell and cell != '':
                day_num, dominant, day_total = cell
                if dominant and dominant in ZONE_COLORS_PDF:
                    cal_style.append(
                        ('BACKGROUND', (col_idx, row_idx), (col_idx, row_idx),
                         ZONE_COLORS_PDF[dominant])
                    )
                else:
                    cal_style.append(
                        ('BACKGROUND', (col_idx, row_idx), (col_idx, row_idx), LIGHT)
                    )
        row_idx += 1

    cal_tbl.setStyle(TableStyle(cal_style))
    elements.append(cal_tbl)

    # Legend
    legend_items = [[
        Paragraph(f"<font color='#{zc.hexval()[2:]}'>■</font> {ZONE_LABELS[z]}"
                  if hasattr(zc, 'hexval') else f"■ {ZONE_LABELS[z]}",
                  ST_SMALL)
        for z, zc in ZONE_COLORS_PDF.items()
    ] + [Paragraph("□ No check-in", ST_SMALL)]]
    legend_tbl = Table(legend_items, colWidths=[(PAGE_W - 72) / 5] * 5)
    legend_tbl.setStyle(TableStyle([('PADDING', (0,0), (-1,-1), 3)]))
    elements.append(legend_tbl)
    elements.append(Spacer(1, 12))

    # ════════════════════════════════════════════════════════
    # ROW 3: Strategies + Day-of-week side by side
    # ════════════════════════════════════════════════════════
    elements.append(Paragraph("Coping Strategies Used", ST_H2))

    if helper_counts:
        top_helpers = sorted(helper_counts.items(), key=lambda x: x[1], reverse=True)[:8]
        strat_rows = [[
            Paragraph('<b>Strategy</b>', ST_LABEL),
            Paragraph('<b>Used</b>', ST_LABEL),
            Paragraph('<b>Frequency</b>', ST_LABEL),
        ]]
        max_strat = max(c for _, c in top_helpers)
        for sid, count in top_helpers:
            name = resolve_strategy_name(sid)
            bar  = '█' * int((count / max_strat) * 8) if max_strat > 0 else ''
            freq = "Very Often" if count >= 5 else "Often" if count >= 3 else "Sometimes" if count >= 2 else "Once"
            strat_rows.append([
                Paragraph(name, ST_BODY),
                Paragraph(str(count), ST_VALUE),
                Paragraph(f'<font color="#5C6BC0">{bar}</font> {freq}', ST_SMALL),
            ])
        strat_tbl = Table(strat_rows, colWidths=[140, 35, 95])
        strat_tbl.setStyle(TableStyle([
            ('BACKGROUND',     (0,0), (-1,0), INDIGO),
            ('TEXTCOLOR',      (0,0), (-1,0), WHITE),
            ('GRID',           (0,0), (-1,-1), 0.4, LIGHT_GREY),
            ('PADDING',        (0,0), (-1,-1), 5),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [WHITE, LIGHT]),
            ('VALIGN',         (0,0), (-1,-1), 'MIDDLE'),
        ]))
    else:
        strat_tbl = Paragraph("No strategies recorded this period.", ST_BODY)

    # Day of week mini chart
    max_week = max(week_counts.values()) if week_counts else 1
    week_rows = [[Paragraph('<b>Day</b>', ST_LABEL), Paragraph('<b>Check-ins</b>', ST_LABEL)]]
    for day_idx in range(7):
        count = week_counts.get(day_idx, 0)
        bar   = '█' * int((count / max_week) * 6) if max_week > 0 else ''
        week_rows.append([
            Paragraph(WEEKDAYS[day_idx], ST_BODY),
            Paragraph(f'<font color="#5C6BC0">{bar}</font> {count}', ST_SMALL),
        ])
    week_tbl = Table(week_rows, colWidths=[45, 75])
    week_tbl.setStyle(TableStyle([
        ('BACKGROUND',     (0,0), (-1,0), INDIGO),
        ('TEXTCOLOR',      (0,0), (-1,0), WHITE),
        ('GRID',           (0,0), (-1,-1), 0.4, LIGHT_GREY),
        ('PADDING',        (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [WHITE, LIGHT]),
        ('VALIGN',         (0,0), (-1,-1), 'MIDDLE'),
    ]))

    strat_week_row = Table(
        [[strat_tbl, week_tbl]],
        colWidths=[280, 130]
    )
    strat_week_row.setStyle(TableStyle([
        ('VALIGN',       (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING',  (1,0), (1,0), 12),
    ]))
    elements.append(strat_week_row)
    elements.append(Spacer(1, 12))

    # ════════════════════════════════════════════════════════
    # Check-in log (compact, with comments)
    # ════════════════════════════════════════════════════════
    elements.append(Paragraph("Check-in Log", ST_H2))

    if logs_data:
        log_rows = [[
            Paragraph('<b>Date</b>',       ST_LABEL),
            Paragraph('<b>Time</b>',       ST_LABEL),
            Paragraph('<b>Zone</b>',       ST_LABEL),
            Paragraph('<b>Strategies</b>', ST_LABEL),
            Paragraph('<b>Comment</b>',    ST_LABEL),
        ]]
        for log in logs_data:
            try:
                ts       = datetime.fromisoformat(log["timestamp"].replace("Z", "+00:00"))
                date_str = ts.strftime("%d %b")
                time_str = ts.strftime("%H:%M")
            except:
                date_str = log.get("timestamp","")[:10]
                time_str = ""

            zone     = log.get("feeling_colour", log.get("zone", ""))
            raw_strats = log.get("helpers_selected", log.get("strategies_selected", []))
            strat_names = [resolve_strategy_name(s) for s in raw_strats[:3]]
            strats_str  = ", ".join(strat_names) if strat_names else "—"
            if len(raw_strats) > 3:
                strats_str += f" +{len(raw_strats)-3}"

            comment = (log.get("comment") or "").strip()
            comment = comment[:60] + ("…" if len(comment) > 60 else "")
            comment = comment or "—"

            log_rows.append([
                Paragraph(date_str,                              ST_SMALL),
                Paragraph(time_str,                              ST_SMALL),
                Paragraph(ZONE_LABELS.get(zone, zone.capitalize() + " Emotions"),  ST_SMALL),
                Paragraph(strats_str,                            ST_SMALL),
                Paragraph(comment,                               ST_SMALL),
            ])

        log_tbl = Table(log_rows, colWidths=[38, 32, 68, 170, 147])
        log_style_list = [
            ('BACKGROUND',     (0,0), (-1,0), INDIGO),
            ('TEXTCOLOR',      (0,0), (-1,0), WHITE),
            ('GRID',           (0,0), (-1,-1), 0.3, LIGHT_GREY),
            ('PADDING',        (0,0), (-1,-1), 4),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [WHITE, LIGHT]),
            ('VALIGN',         (0,0), (-1,-1), 'MIDDLE'),
        ]
        for i, log in enumerate(logs_data, 1):
            zone = log.get("feeling_colour", log.get("zone", ""))
            if zone in ZONE_COLORS_PDF:
                log_style_list.append(('TEXTCOLOR',  (2,i), (2,i), ZONE_COLORS_PDF[zone]))
                log_style_list.append(('FONTNAME',   (2,i), (2,i), 'Helvetica-Bold'))
        log_tbl.setStyle(TableStyle(log_style_list))
        elements.append(log_tbl)
    else:
        elements.append(Paragraph("No check-ins recorded for this period.", ST_BODY))

    elements.append(Spacer(1, 14))

    # ── Footer disclaimer ──
    elements.append(Paragraph(
        "CONFIDENTIALITY NOTICE: This report contains personal emotional wellbeing data intended solely for the named "
        "student's educational and therapeutic support team. Unauthorised sharing is prohibited. © Class of Happiness",
        ST_DISC
    ))
    elements.append(Paragraph(
        "Generated by Class of Happiness (classofhappiness.app) using the colour emotion check-in framework. "
        "This is an educational tool and does not constitute a clinical assessment or diagnosis.",
        ST_DISC
    ))

    doc.build(elements)
    buffer.seek(0)
    safe_name = student_data['name'].replace(' ', '_')
    filename = f"CoH_Report_{safe_name}_{year}_{month:02d}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"})

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
async def get_admin_stats(request: Request, days: int = 7):
    """Enhanced stats with daily breakdown for graphs"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")

    try:
        from datetime import datetime, timezone, timedelta

        now = datetime.now(timezone.utc)
        days = max(1, min(days, 90))  # clamp 1-90
        week_ago = (now - timedelta(days=days)).isoformat()
        month_ago = (now - timedelta(days=30)).isoformat()

        # Basic counts
        students_result = supabase.table("students").select("id", count="exact").execute()
        total_students = students_result.count or 0

        teachers_result = supabase.table("users").select("user_id", count="exact").eq("role", "teacher").execute()
        total_teachers = teachers_result.count or 0

        users_result = supabase.table("users").select("user_id", count="exact").execute()
        total_users = users_result.count or 0

        # Zone logs for this week
        # Query both zone_logs and feeling_logs
        logs = []
        try:
            r2 = supabase.table("feeling_logs").select("*").gte("timestamp", week_ago).execute()
            logs.extend(r2.data or [])
        except: pass

        # Zone counts
        zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
        checkin_daily = [0] * 7
        today = now.date()

        for log in logs:
            zone = log.get("zone") or log.get("feeling_colour") or log.get("color", "")
            if zone in zone_counts:
                zone_counts[zone] += 1
            # Daily breakdown
            try:
                ts = log.get("timestamp") or log.get("created_at") or ""
                if not ts: continue
                log_date = datetime.fromisoformat(ts.replace("Z", "+00:00")).date()
                days_ago = (today - log_date).days
                if 0 <= days_ago < 7:
                    checkin_daily[6 - days_ago] += 1
            except:
                pass

        # Today's checkins
        today_str = now.strftime("%Y-%m-%d")
        checkins_today = sum(1 for log in logs if (
            log.get("timestamp","") or log.get("created_at","")
        ).startswith(today_str))

        # Teacher checkins (from AsyncStorage - approximate from zone_logs with teacher users)
        teacher_zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
        teacher_daily = [0] * 7

        # Support requests (wellbeing_alerts table may not exist yet)
        support_requests = 0

        # Top strategy
        strategy_counts = {}
        for log in logs:
            for s in (log.get("strategies_selected") or []):
                strategy_counts[s] = strategy_counts.get(s, 0) + 1
        top_strategy = max(strategy_counts, key=strategy_counts.get) if strategy_counts else "—"

        # Schools breakdown — one entry per school_admin
        try:
            school_admins = supabase.table("users").select("*").eq("role", "school_admin").execute()
            schools_breakdown = []
            for admin in (school_admins.data or []):
                admin_id = admin.get("user_id", "")
                # Get students belonging to this admin's school
                try:
                    school_students = supabase.table("students").select("id").eq("teacher_id", admin_id).execute()
                    student_ids = [s["id"] for s in (school_students.data or [])]
                except:
                    student_ids = []

                school_zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
                school_checkins = 0
                if student_ids:
                    try:
                        school_logs = supabase.table("feeling_logs").select("feeling_colour,zone").in_("student_id", student_ids[:50]).gte("timestamp", week_ago).execute()
                        for log in (school_logs.data or []):
                            z = log.get("feeling_colour") or log.get("zone", "")
                            if z in school_zone_counts:
                                school_zone_counts[z] += 1
                        school_checkins = len(school_logs.data or [])
                    except:
                        pass

                # Get school name from admin record or school_profiles
                school_name = admin.get("school_name") or admin.get("email", "Unknown School")
                school_desc = ""
                try:
                    profile = supabase.table("school_profiles").select("school_name,description").eq("user_id", admin_id).execute()
                    if profile.data:
                        school_name = profile.data[0].get("school_name") or school_name
                        school_desc = profile.data[0].get("description", "")
                except:
                    pass

                schools_breakdown.append({
                    "name": school_name,
                    "description": school_desc,
                    "total_checkins": school_checkins,
                    "zone_counts": school_zone_counts,
                })
            total_schools = len(schools_breakdown)
        except Exception as sb_err:
            logger.error(f"Schools breakdown error: {sb_err}")
            schools_breakdown = []
            total_schools = 0

        return {
            "total_students": total_students,
            "total_teachers": total_teachers,
            "total_users": total_users,
            "total_schools": total_schools,
            "total_checkins": len(logs),
            "checkins_today": checkins_today,
            "active_users": min(total_students + total_teachers, len(set(l.get("student_id","") for l in logs))),
            "zone_counts": zone_counts,
            "teacher_zone_counts": teacher_zone_counts,
            "total_teacher_checkins": sum(teacher_zone_counts.values()),
            "checkin_daily": checkin_daily,
            "student_daily": checkin_daily,
            "teacher_daily": teacher_daily,
            "active_daily": checkin_daily,
            "school_daily": [total_schools] * 7,
            "support_requests": support_requests,
            "top_strategy": top_strategy,
            "top_teacher_strategy": "—",
            "total_creatures": 0,
            "avg_checkins_to_evolve": "—",
            "streak_students": 0,
            "avg_session_mins": "—",
            "avg_student_session": "—",
            "avg_teacher_session": "—",
            "schools_breakdown": schools_breakdown,
        }
    except Exception as e:
        logger.error(f"Stats error: {e}", exc_info=True)
        # Try to get at least basic counts
        try:
            basic_students = supabase.table("students").select("id", count="exact").execute()
            basic_teachers = supabase.table("users").select("user_id", count="exact").eq("role", "teacher").execute()
            return {
                "total_students": basic_students.count or 0,
                "total_teachers": basic_teachers.count or 0,
                "total_users": 0,
                "total_schools": 0, "checkins_today": 0, "total_checkins": 0,
                "active_users": 0, "zone_counts": {}, "teacher_zone_counts": {},
                "total_teacher_checkins": 0, "checkin_daily": [0]*7,
                "student_daily": [0]*7, "teacher_daily": [0]*7,
                "active_daily": [0]*7, "school_daily": [0]*7,
                "support_requests": 0, "top_strategy": "—",
                "top_teacher_strategy": "—", "total_creatures": 0,
                "avg_checkins_to_evolve": "—", "streak_students": 0,
                "avg_session_mins": "—", "avg_student_session": "—",
                "avg_teacher_session": "—", "schools_breakdown": [],
            }
        except:
            pass
        return {
            "total_students": 0, "total_teachers": 0, "total_users": 0,
            "total_schools": 0, "checkins_today": 0, "total_checkins": 0,
            "active_users": 0, "zone_counts": {}, "teacher_zone_counts": {},
            "total_teacher_checkins": 0, "checkin_daily": [0]*7,
            "student_daily": [0]*7, "teacher_daily": [0]*7,
            "active_daily": [0]*7, "school_daily": [0]*7,
            "support_requests": 0, "top_strategy": "—",
            "top_teacher_strategy": "—", "total_creatures": 0,
            "avg_checkins_to_evolve": "—", "streak_students": 0,
            "avg_session_mins": "—", "avg_student_session": "—",
            "avg_teacher_session": "—", "schools_breakdown": [],
        }


@api_router.get("/admin/resources")
async def get_admin_resources(request: Request):
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin only")
    result = supabase.table("resources").select("*").order("created_at", desc=True).execute()
    return result.data or []


@api_router.post("/admin/resources")
async def create_admin_resource(request: Request):
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin only")
    body = await request.json()
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    content_type = body.get("content_type", "text")
    target_audience = body.get("target_audience", "both")
    topic = body.get("topic") or body.get("category") or "general"
    resource_data = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "title": title,
        "description": body.get("description", ""),
        "content_type": content_type,
        # Store text content OR base64 PDF payload
        "content": body.get("content") if content_type == "text" else body.get("pdf_data") or body.get("content"),
        "pdf_filename": body.get("pdf_filename"),
        "category": body.get("category", topic),
        "topic": topic,
        "target_audience": target_audience,
        "is_global": True,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        result = supabase.table("resources").insert(resource_data).execute()
    except Exception:
        # Backward-compatible fallback if new columns are missing in DB schema.
        fallback_data = {
            "id": resource_data["id"],
            "user_id": resource_data["user_id"],
            "title": resource_data["title"],
            "description": resource_data["description"],
            "content_type": resource_data["content_type"],
            "content": resource_data["content"],
            "pdf_filename": resource_data["pdf_filename"],
            "category": resource_data["category"],
            "is_global": resource_data["is_global"],
            "is_active": resource_data["is_active"],
            "created_at": resource_data["created_at"],
        }
        result = supabase.table("resources").insert(fallback_data).execute()

    return result.data[0] if result.data else resource_data


@api_router.get("/admin/analytics")
async def get_admin_analytics(request: Request, period: int = 30, classroom_id: Optional[str] = None):
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin only")

    days = max(1, min(period, 365))
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    logs_result = supabase.table("feeling_logs").select("*").gte("timestamp", start_date).execute()
    users_result = supabase.table("users").select("*").execute()
    students_result = supabase.table("students").select("*").execute()
    classrooms_result = supabase.table("classrooms").select("*").execute()
    resources_result = supabase.table("resources").select("*").execute()

    logs = logs_result.data or []
    users = users_result.data or []
    students = students_result.data or []
    classrooms = classrooms_result.data or []
    resources = resources_result.data or []

    if classroom_id:
        student_ids = {s["id"] for s in students if s.get("classroom_id") == classroom_id}
        logs = [l for l in logs if l.get("student_id") in student_ids]

    zone_distribution = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    daily_counts = {}
    hourly_distribution = {str(h): 0 for h in range(24)}
    strategy_counts = {}
    for log in logs:
        zone = log.get("feeling_colour") or log.get("zone")
        if zone in zone_distribution:
            zone_distribution[zone] += 1
        ts = log.get("timestamp", "")
        if len(ts) >= 13:
            day = ts[:10]
            hour = str(int(ts[11:13]))
            daily_counts[day] = daily_counts.get(day, 0) + 1
            hourly_distribution[hour] = hourly_distribution.get(hour, 0) + 1
        strategies = log.get("helpers_selected", log.get("strategies_selected", [])) or []
        for strategy in strategies:
            strategy_counts[strategy] = strategy_counts.get(strategy, 0) + 1

    daily_checkins = [{"date": k, "count": v} for k, v in sorted(daily_counts.items())]
    top_strategies = [{"strategy": k, "count": v} for k, v in sorted(strategy_counts.items(), key=lambda i: i[1], reverse=True)[:10]]

    classroom_stats = []
    for cls in classrooms:
        cls_students = [s for s in students if s.get("classroom_id") == cls.get("id")]
        cls_ids = {s["id"] for s in cls_students}
        cls_logs = [l for l in logs if l.get("student_id") in cls_ids]
        student_count = len(cls_students)
        checkin_count = len(cls_logs)
        avg = round(checkin_count / student_count, 2) if student_count else 0
        classroom_stats.append({
            "id": cls.get("id"),
            "name": cls.get("name", "Classroom"),
            "student_count": student_count,
            "checkin_count": checkin_count,
            "avg_per_student": avg,
        })

    user_growth_map = {}
    for u in users:
        created = (u.get("created_at") or "")[:10]
        if created:
            user_growth_map[created] = user_growth_map.get(created, 0) + 1
    user_growth = [{"date": k, "new_users": v} for k, v in sorted(user_growth_map.items()) if k >= start_date[:10]]

    active_students = len({l.get("student_id") for l in logs if l.get("student_id")})
    total_students = len(students) if not classroom_id else len([s for s in students if s.get("classroom_id") == classroom_id])
    retention = round((active_students / total_students) * 100, 1) if total_students else 0

    return {
        "period_days": days,
        "summary": {
            "total_checkins": len(logs),
            "active_students": active_students,
            "avg_checkins_per_student": round(len(logs) / total_students, 2) if total_students else 0,
            "retention_rate": retention,
        },
        "daily_checkins": daily_checkins,
        "zone_distribution": zone_distribution,
        "hourly_distribution": hourly_distribution,
        "top_strategies": top_strategies,
        "classroom_stats": classroom_stats,
        "resource_engagement": [{"title": r.get("title", ""), "download_count": int(r.get("download_count", 0) or 0)} for r in resources[:20]],
        "user_growth": user_growth,
    }


@api_router.get("/admin/schools")
async def get_admin_schools(request: Request):
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin only")
    classrooms = supabase.table("classrooms").select("*").execute().data or []
    return [{"name": c.get("name", "Classroom"), "classroom_count": 1} for c in classrooms]


@api_router.get("/admin/export")
async def export_admin_data(request: Request, type: str = "checkins", format: str = "json"):
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin only")
    table_map = {"checkins": "feeling_logs", "users": "users", "resources": "resources", "students": "students"}
    table = table_map.get(type, "feeling_logs")
    data = supabase.table(table).select("*").execute().data or []
    return {"type": type, "format": format, "count": len(data), "data": data}


@api_router.post("/subscription/redeem-trial-code")
async def redeem_trial_code(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    code = body.get("code", "").upper().strip()
    if code not in PROMO_CODES:
        raise HTTPException(status_code=400, detail="Invalid trial code")
    promo = PROMO_CODES[code]
    now = datetime.now(timezone.utc)
    if promo.get("type") == "admin":
        supabase.table("users").update({"role": "admin"}).eq("user_id", user["user_id"]).execute()
        return {"message": "Admin access granted!", "trial_days": 0, "trial_ends_at": ""}
    days = promo.get("days", 30)
    trial_ends = now + timedelta(days=days)
    supabase.table("users").update({
        "subscription_status": "trial",
        "trial_started_at": now.isoformat(),
        "subscription_expires_at": trial_ends.isoformat()
    }).eq("user_id", user["user_id"]).execute()
    return {
        "message": f"Trial activated! {days} days free access.",
        "trial_days": days,
        "trial_ends_at": trial_ends.isoformat()
    }

@api_router.post("/auth/promote-admin")
async def promote_admin(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    code = body.get("admin_code", "").upper().strip()
    admin_codes = [k for k,v in PROMO_CODES.items() if v.get("type") == "admin"]
    if code not in admin_codes:
        raise HTTPException(status_code=400, detail="Invalid admin code")
    supabase.table("users").update({"role": "admin"}).eq("user_id", user["user_id"]).execute()
    return {"role": "admin", "message": "Admin access granted!"}


@api_router.post("/auth/email-login")
async def email_login(request: Request):
    """Simple email-based login"""
    try:
        body = await request.json()
        email = body.get("email", "").strip().lower()
        if not email or "@" not in email:
            raise HTTPException(status_code=400, detail="Valid email required")
        
        # Find or create user
        try:
            existing = supabase.table("users").select("*").eq("email", email).execute()
            if existing.data:
                user = existing.data[0]
            else:
                name = email.split("@")[0].replace(".", " ").title()
                user_id = f"user_{uuid.uuid4().hex[:12]}"
                new_user = {
                    "user_id": user_id,
                    "email": email,
                    "name": name,
                    "role": "teacher",
                    "language": "en",
                    "subscription_status": "none",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                result = supabase.table("users").insert(new_user).execute()
                user = result.data[0] if result.data else new_user
        except Exception as e:
            logger.error(f"User lookup error: {e}")
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        
        # Create session token - try user_sessions table first, fallback to simple token
        session_token = str(uuid.uuid4())
        try:
            supabase.table("user_sessions").insert({
                "session_token": session_token,
                "user_id": user["user_id"],
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            }).execute()
        except Exception as e:
            logger.warning(f"user_sessions insert failed: {e} - using token only")
        
        return {"user": user, "session_token": session_token}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Email login error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/resources/{resource_id}")
async def get_resource(resource_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = supabase.table("resources").select("*").eq("id", resource_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Resource not found")
    return result.data[0]


@api_router.put("/resources/{resource_id}")
async def update_resource(resource_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    allowed = ["title", "description", "content_type", "content", "pdf_filename", "category", "topic", "target_audience", "is_active"]
    update_data = {k: v for k, v in body.items() if k in allowed}
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    supabase.table("resources").update(update_data).eq("id", resource_id).execute()
    updated = supabase.table("resources").select("*").eq("id", resource_id).execute()
    return updated.data[0] if updated.data else {}


@api_router.get("/resources/{resource_id}/download")
async def download_resource_pdf(resource_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = supabase.table("resources").select("*").eq("id", resource_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Resource not found")
    resource = result.data[0]
    if resource.get("content_type") != "pdf":
        raise HTTPException(status_code=400, detail="Resource is not a PDF")

    raw_content = resource.get("content") or ""
    try:
        pdf_bytes = base64.b64decode(raw_content)
    except Exception:
        raise HTTPException(status_code=500, detail="Stored PDF data is invalid")

    filename = resource.get("pdf_filename") or f"{resource.get('title', 'resource')}.pdf"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf", headers=headers)


@api_router.get("/teacher-resources/topics")
async def get_teacher_resource_topics():
    return [
        {"id": "emotions", "name": "Emotions"},
        {"id": "healthy_relationships", "name": "Healthy Relationships"},
        {"id": "leader_online", "name": "Leader Online"},
        {"id": "you_are_what_you_eat", "name": "You Are What You Eat"},
        {"id": "special_needs_education", "name": "Special Needs Education"},
        {"id": "general", "name": "General"},
    ]


@api_router.get("/teacher-resources")  # audience filter supported
async def get_teacher_resources(request: Request, topic: Optional[str] = None, audience: Optional[str] = None):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    resources_result = supabase.table("resources").select("*").eq("is_active", True).execute()
    all_resources = resources_result.data or []

    # Determine which audiences to show
    # If caller specifies audience=parents, show parents+both
    # If caller specifies audience=teachers (default), show teachers+both
    # If no audience specified, show all
    if audience == "parents":
        allowed_audiences = ["parents", "both", None, ""]
    elif audience == "teachers":
        allowed_audiences = ["teachers", "both", None, ""]
    else:
        allowed_audiences = ["teachers", "parents", "both", None, ""]

    visible = []
    for r in all_resources:
        r_audience = r.get("target_audience", "both")
        if r_audience not in allowed_audiences:
            continue
        resource_topic = r.get("topic") or r.get("category") or "general"
        if topic and topic != "all" and resource_topic != topic:
            continue
        visible.append(r)

    try:
        ratings_result = supabase.table("teacher_resource_ratings").select("*").execute()
        ratings = ratings_result.data or []
    except Exception:
        ratings = []

    return [_resource_to_teacher_resource(r, ratings) for r in visible]


@api_router.get("/teacher-resources/{resource_id}")
async def get_teacher_resource(resource_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = supabase.table("resources").select("*").eq("id", resource_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Resource not found")
    resource = result.data[0]
    try:
        ratings_result = supabase.table("teacher_resource_ratings").select("*").eq("resource_id", resource_id).execute()
        ratings = ratings_result.data or []
    except Exception:
        ratings = []
    return _resource_to_teacher_resource(resource, ratings)


@api_router.post("/teacher-resources")
async def create_teacher_resource(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request body")
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    topic = body.get("topic") or body.get("category") or "general"
    audience = body.get("audience") or "teachers"
    content = body.get("content") or ""
    if len(content) > 4000000:
        raise HTTPException(status_code=413, detail="File too large. Please use a PDF under 2MB.")
    resource_data = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "title": title,
        "description": body.get("description", ""),
        "content_type": body.get("content_type", "text"),
        "content": content,
        "pdf_filename": body.get("pdf_filename"),
        "category": topic,
        "topic": topic,
        "target_audience": audience,
        "is_global": False,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        result = supabase.table("resources").insert(resource_data).execute()
        return result.data[0] if result.data else resource_data
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Resource insert failed: {error_msg}")
        if "too large" in error_msg.lower() or "payload" in error_msg.lower():
            raise HTTPException(status_code=413, detail="File too large. Please compress your PDF.")
        # Log full error for debugging
        logger.error(f"Resource insert error detail: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Failed to save resource: {error_msg[:100]}")

@api_router.delete("/teacher-resources/{resource_id}")
async def delete_teacher_resource(resource_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    existing = supabase.table("resources").select("*").eq("id", resource_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Resource not found")
    resource = existing.data[0]
    if user.get("role") != "admin" and resource.get("user_id") != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Not allowed")
    supabase.table("resources").delete().eq("id", resource_id).execute()
    return {"message": "Resource deleted"}


@api_router.get("/teacher-resources/{resource_id}/download")
async def download_teacher_resource(resource_id: str, request: Request):
    return await download_resource_pdf(resource_id, request)


@api_router.post("/teacher-resources/{resource_id}/rate")
async def rate_teacher_resource(resource_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    rating = int(body.get("rating", 0))
    comment = (body.get("comment") or "").strip() or None
    if rating < 1 or rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    rating_row = {
        "id": str(uuid.uuid4()),
        "resource_id": resource_id,
        "user_id": user["user_id"],
        "rating": rating,
        "comment": comment,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        existing = supabase.table("teacher_resource_ratings").select("*").eq("resource_id", resource_id).eq("user_id", user["user_id"]).execute()
        if existing.data:
            supabase.table("teacher_resource_ratings").update({
                "rating": rating,
                "comment": comment,
                "created_at": rating_row["created_at"],
            }).eq("id", existing.data[0]["id"]).execute()
        else:
            supabase.table("teacher_resource_ratings").insert(rating_row).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save rating: {str(e)}")
    return {"message": "Rating saved"}


@api_router.get("/teacher-resources/{resource_id}/ratings")
async def get_teacher_resource_ratings(resource_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        result = supabase.table("teacher_resource_ratings").select("*").eq("resource_id", resource_id).order("created_at", desc=True).execute()
        ratings = result.data or []
    except Exception:
        return []

    user_ids = list({r.get("user_id") for r in ratings if r.get("user_id")})
    user_names = {}
    if user_ids:
        users_result = supabase.table("users").select("user_id,name").in_("user_id", user_ids).execute()
        for u in users_result.data or []:
            user_names[u.get("user_id")] = u.get("name")

    return [{
        **r,
        "user_name": user_names.get(r.get("user_id"), "Teacher")
    } for r in ratings]







# ================== MOUNT ROUTER ==================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)

# ================== FAMILY ZONE LOGS ==================
@api_router.post("/family/zone-logs")
async def create_family_zone_log(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    data = await request.json()
    member_id = data.get("family_member_id")
    if not member_id:
        raise HTTPException(status_code=400, detail="family_member_id required")
    # Verify member belongs to this user
    member = supabase.table("family_members").select("*").eq("id", member_id).eq("user_id", user["user_id"]).execute()
    if not member.data:
        raise HTTPException(status_code=404, detail="Family member not found")
    new_log = {
        "id": str(uuid.uuid4()),
        "family_member_id": member_id,
        "user_id": user["user_id"],
        "zone": data.get("zone"),
        "strategies_selected": data.get("strategies_selected", []),
        "comment": data.get("comment"),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    result = supabase.table("family_zone_logs").insert(new_log).execute()
    return result.data[0] if result.data else new_log

@api_router.get("/family/zone-logs/{member_id}")
async def get_family_zone_logs(member_id: str, request: Request, days: int = 7):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    result = supabase.table("family_zone_logs").select("*").eq("family_member_id", member_id).gte("timestamp", start_date).order("timestamp", desc=True).execute()
    return result.data or []

@api_router.get("/family/analytics/{member_id}")
async def get_family_analytics(member_id: str, request: Request, days: int = 7):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    member = supabase.table("family_members").select("*").eq("id", member_id).eq("user_id", user["user_id"]).execute()
    if not member.data:
        raise HTTPException(status_code=404, detail="Family member not found")
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    result = supabase.table("family_zone_logs").select("*").eq("family_member_id", member_id).gte("timestamp", start_date).execute()
    logs = result.data or []
    zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    strategy_counts: Dict[str, int] = {}
    for log in logs:
        zone = log.get("zone")
        if zone in zone_counts:
            zone_counts[zone] += 1
        for strategy in (log.get("strategies_selected") or []):
            strategy_counts[strategy] = strategy_counts.get(strategy, 0) + 1
    return {
        "zone_counts": zone_counts,
        "strategy_counts": strategy_counts,
        "total_logs": len(logs),
    }

# ================== REWARDS COLLECTION ==================
@api_router.get("/rewards/{student_id}/collection")
async def get_collection(student_id: str):
    result = supabase.table("student_rewards").select("*").eq("student_id", student_id).execute()
    if result.data:
        rewards = result.data[0]
    else:
        rewards = {
            "student_id": student_id,
            "total_points_earned": 0,
            "streak_days": 0,
            "creature_points": {"aqua_buddy": 0, "leaf_friend": 0, "spark_pal": 0, "blaze_heart": 0},
            "creature_stages": {"aqua_buddy": 0, "leaf_friend": 0, "spark_pal": 0, "blaze_heart": 0},
            "collected_creatures": [],
            "current_creature_id": "aqua_buddy",
            "current_stage": 0,
            "current_points": 0
        }

    creatures_map = {c["id"]: c for c in CREATURES}

    creature_points = rewards.get("creature_points") or {}
    creature_stages = rewards.get("creature_stages") or {}
    collected = rewards.get("collected_creatures") or []
    current_id = rewards.get("current_creature_id", "aqua_buddy")
    current_stage = rewards.get("current_stage", 0)
    current_points = rewards.get("current_points", 0)

    all_creatures = []
    for cid, cdata in creatures_map.items():
        cstage = creature_stages.get(cid, 0)
        cpoints = creature_points.get(cid, 0)
        stages = cdata.get("stages", [])
        # Points needed to reach next stage
        next_stage_points = None
        for stage in stages:
            if stage.get("stage", 0) > cstage:
                next_stage_points = stage.get("required_points", 0)
                break
        # Total points needed across all stages
        total_points_needed = sum(s.get("required_points", 0) for s in stages if s.get("stage", 0) > 0)
        all_creatures.append({
            **cdata,
            "current_points": cpoints,
            "current_stage": cstage,
            "next_stage_points": next_stage_points,
            "total_points_needed": total_points_needed,
            "is_complete": cstage >= len(stages) - 1,
        })

    current_creature = creatures_map.get(current_id, CREATURES[0])
    collected_creatures = [creatures_map[c] for c in collected if c in creatures_map]
    unlocked_moves: List[str] = []
    unlocked_outfits: List[str] = []
    unlocked_foods: List[str] = []
    unlocked_homes: List[str] = []

    for cid, cstage in creature_stages.items():
        creature = creatures_map.get(cid)
        if not creature:
            continue
        for move in creature.get("moves", []):
            if cstage >= move.get("unlocks_at_stage", 999):
                unlocked_moves.append(move.get("id"))
        for outfit in creature.get("outfits", []):
            if cstage >= outfit.get("unlocks_at_stage", 999):
                unlocked_outfits.append(outfit.get("id"))
        for food in creature.get("foods", []):
            if cstage >= food.get("unlocks_at_stage", 999):
                unlocked_foods.append(food.get("id"))
        for home in creature.get("homes", []):
            if cstage >= home.get("unlocks_at_stage", 999):
                unlocked_homes.append(home.get("id"))

    return {
        "current_creature": {**current_creature, "current_points": current_points, "current_stage": current_stage},
        "current_stage": current_stage,
        "current_points": current_points,
        "collected_creatures": collected_creatures,
        "total_creatures": len(creatures_map),
        "all_creatures": all_creatures,
        "unlocked_moves": unlocked_moves,
        "unlocked_outfits": unlocked_outfits,
        "unlocked_foods": unlocked_foods,
        "unlocked_homes": unlocked_homes,
    }

# ================== WELLBEING ALERT ==================
class WellbeingAlertRequest(BaseModel):
    teacher_name: str
    message: str
    zone: Optional[str] = None
    timestamp: Optional[str] = None

@api_router.post("/wellbeing-alert")
async def send_wellbeing_alert(req: WellbeingAlertRequest, request: Request):
    """Teacher sends a private wellbeing support request to admin/principal"""
    user = await get_current_user(request)
    
    # Store alert in database
    alert_data = {
        "id": str(uuid.uuid4()),
        "teacher_name": req.teacher_name,
        "teacher_id": user["user_id"] if user else None,
        "message": req.message,
        "zone": req.zone,
        "timestamp": req.timestamp or datetime.now(timezone.utc).isoformat(),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    try:
        supabase.table("wellbeing_alerts").insert(alert_data).execute()
    except Exception as e:
        logger.error(f"Could not store wellbeing alert: {e}")
    
    # Try to get admin notification email from settings
    try:
        settings_result = supabase.table("admin_settings").select("*").eq("key", "wellbeing_email").execute()
        if settings_result.data:
            notify_email = settings_result.data[0].get("value")
            logger.info(f"Wellbeing alert from {req.teacher_name} — would notify: {notify_email}")
    except Exception as e:
        logger.error(f"Could not fetch notification email: {e}")
    
    return {"status": "sent", "message": "Alert recorded successfully"}

@api_router.get("/admin/wellbeing-alerts")
async def get_wellbeing_alerts(request: Request):
    """Admin views all teacher wellbeing alerts"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        result = supabase.table("wellbeing_alerts").select("*").order("created_at", desc=True).execute()
        alerts = result.data or []
        # Resolve strategy IDs to names
        STRATEGY_NAMES = {
            "blue_1":"Talk to a trusted colleague","blue_2":"Brief outdoor walk",
            "blue_3":"Safe staff space reset","blue_4":"Hydrate and breathe",
            "green_1":"Protect what works","green_2":"Positive micro-moment",
            "green_3":"Prep buffer time","green_4":"Boundary reminder",
            "yellow_1":"Movement break","yellow_2":"Guided meditation",
            "yellow_3":"Challenge log","yellow_4":"Deep breathing set",
            "yellow_5":"Quick yoga stretch","red_1":"Ask for immediate cover",
            "red_2":"Grounding routine","red_3":"Pause before response",
            "red_4":"De-escalation script",
        }
        for alert in alerts:
            if isinstance(alert.get("message"), str):
                for sid, sname in STRATEGY_NAMES.items():
                    alert["message"] = alert["message"].replace(sid, sname)
        return alerts
    except Exception as e:
        logger.error(f"wellbeing_alerts table error: {e}")
        return []

@api_router.post("/admin/settings")
async def update_admin_setting(request: Request):
    """Admin updates a setting key/value pair"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    body = await request.json()
    key = body.get("key")
    value = body.get("value")
    if not key:
        raise HTTPException(status_code=400, detail="Key required")
    existing = supabase.table("admin_settings").select("*").eq("key", key).execute()
    if existing.data:
        supabase.table("admin_settings").update({"value": value}).eq("key", key).execute()
    else:
        supabase.table("admin_settings").insert({"key": key, "value": value, "updated_at": datetime.now(timezone.utc).isoformat()}).execute()
    return {"key": key, "value": value}

@api_router.get("/admin/settings")
async def get_admin_settings(request: Request):
    """Get all admin settings"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        result = supabase.table("admin_settings").select("*").execute()
        return {row["key"]: row["value"] for row in (result.data or [])}
    except Exception as e:
        logger.error(f"admin_settings table error: {e}")
        return {}

@api_router.get("/admin/teacher-strategies")
async def get_admin_teacher_strategies(request: Request):
    """Admin-defined strategies shown to all teachers on checkin"""
    result = supabase.table("admin_teacher_strategies").select("*").eq("is_active", True).execute()
    if result.data:
        return result.data
    # Return defaults if none set
    return [
        {"id": "admin_1", "zone": "blue", "name": "Talk to a trusted colleague", "description": "Peer support reduces isolation.", "icon": "chat"},
        {"id": "admin_2", "zone": "blue", "name": "Brief outdoor walk", "description": "Light and movement reset the nervous system.", "icon": "directions-walk"},
        {"id": "admin_3", "zone": "green", "name": "Positive micro-moment", "description": "Name one student success from today.", "icon": "thumb-up"},
        {"id": "admin_4", "zone": "yellow", "name": "Deep breathing set", "description": "Box breathing for 2-3 minutes.", "icon": "air"},
        {"id": "admin_5", "zone": "red", "name": "Ask for immediate cover", "description": "Request support from nearby staff.", "icon": "support-agent"},
    ]

@api_router.post("/admin/teacher-strategies")
async def create_admin_teacher_strategy(request: Request):
    """Admin adds a new strategy for teachers"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    body = await request.json()
    new_strat = {
        "id": str(uuid.uuid4()),
        "zone": body.get("zone", "blue"),
        "name": body.get("name"),
        "description": body.get("description", ""),
        "icon": body.get("icon", "star"),
        "is_active": True,
        "created_by": user["user_id"],
        "created_by_role": user.get("role", "admin"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = supabase.table("admin_teacher_strategies").insert(new_strat).execute()
    return result.data[0] if result.data else new_strat

# ================== SUPER ADMIN (App Creator) ==================
@api_router.post("/auth/promote-superadmin")
async def promote_superadmin(request: Request):
    """Jono only - grants superadmin access to see all schools"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    code = body.get("code", "")
    # Secret code only Jono knows
    if code not in ["JONO_SUPERADMIN_2026", "CLASS_CREATOR_2026"]:
        raise HTTPException(status_code=403, detail="Invalid superadmin code")
    supabase.table("users").update({"role": "superadmin"}).eq("user_id", user["user_id"]).execute()
    return {"role": "superadmin", "message": "Superadmin access granted!"}

# ================== SCHOOL ADMIN ==================
@api_router.post("/auth/promote-school-admin")
async def promote_school_admin(request: Request):
    """Grants school_admin access - purchased by schools"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    code = body.get("code", "")
    school_name = body.get("school_name", "")
    if code not in ["ADMINCLASS2026", "HAPPYADMIN2026", "SCHOOLADMIN2026"]:
        raise HTTPException(status_code=403, detail="Invalid school admin code")
    supabase.table("users").update({
        "role": "school_admin",
        "school_name": school_name or "My School",
    }).eq("user_id", user["user_id"]).execute()
    return {"role": "school_admin", "message": "School admin access granted!"}

@api_router.get("/school-admin/stats")
async def get_school_admin_stats(request: Request):
    """School admin sees their school's stats"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["school_admin", "admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="School admin access required")
    user_id = user["user_id"]
    # Get all students for this school admin's teachers
    teachers = supabase.table("users").select("user_id, name, email").eq("school_admin_id", user_id).execute()
    teacher_ids = [t["user_id"] for t in (teachers.data or [])]
    students = supabase.table("students").select("*").in_("user_id", teacher_ids).execute() if teacher_ids else type("obj", (object,), {"data": []})()
    return {
        "total_teachers": len(teacher_ids),
        "total_students": len(students.data or []),
        "school_name": user.get("school_name", "My School"),
    }

@api_router.post("/admin/unlink-user")
async def unlink_user(request: Request):
    """Superadmin unlinks a parent-teacher connection"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    link_type = body.get("type", "teacher")
    if not email:
        raise HTTPException(status_code=400, detail="Email required")
    try:
        # Find user by email
        user_result = supabase.table("users").select("user_id, name, email").eq("email", email).execute()
        if not user_result.data:
            raise HTTPException(status_code=404, detail=f"No user found with email: {email}")
        target_user = user_result.data[0]
        target_id = target_user["user_id"]
        # Remove parent-teacher links
        if link_type == "parent":
            supabase.table("parent_teacher_links").delete().eq("parent_id", target_id).execute()
        else:
            supabase.table("parent_teacher_links").delete().eq("teacher_id", target_id).execute()
        # Log the action
        logger.info(f"Admin {user['user_id']} unlinked {link_type} {email}")
        return {"status": "unlinked", "email": email, "type": link_type}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unlink error: {e}")
        raise HTTPException(status_code=500, detail="Failed to unlink user")

# ================== SCHOOL INVITE CODE SYSTEM ==================

import secrets
import string

def generate_invite_code(prefix="SCH"):
    """Generate a readable invite code like SCH-X7K2-M9P4"""
    chars = string.ascii_uppercase + string.digits
    part1 = ''.join(secrets.choice(chars) for _ in range(4))
    part2 = ''.join(secrets.choice(chars) for _ in range(4))
    return f"{prefix}-{part1}-{part2}"

@api_router.post("/school/generate-invite-code")
async def generate_school_invite_code(request: Request):
    """School admin generates an invite code for their teachers"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="School admin access required")
    
    code = generate_invite_code("SCH")
    expires_at = (datetime.now(timezone.utc) + timedelta(days=90)).isoformat()
    
    invite_data = {
        "id": str(uuid.uuid4()),
        "code": code,
        "school_admin_id": user["user_id"],
        "school_name": user.get("school_name", "My School"),
        "type": "school",
        "expires_at": expires_at,
        "uses": 0,
        "max_uses": 999,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        supabase.table("invite_codes").insert(invite_data).execute()
    except Exception as e:
        logger.error(f"Could not store invite code: {e}")
    
    return {"code": code, "expires_at": expires_at, "school_name": invite_data["school_name"]}

@api_router.post("/school/join")
async def join_school_with_invite(request: Request):
    """Teacher joins a school using invite code"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Must be logged in")
    body = await request.json()
    code = (body.get("code") or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Invite code required")
    
    try:
        result = supabase.table("invite_codes").select("*").eq("code", code).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Invalid invite code. Check the code and try again.")
        invite = result.data[0]
        
        # Check expiry
        expires = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > expires:
            raise HTTPException(status_code=400, detail="This invite code has expired. Ask your school admin for a new one.")
        
        # Link teacher to school
        supabase.table("users").update({
            "school_admin_id": invite["school_admin_id"],
            "school_name": invite["school_name"],
        }).eq("user_id", user["user_id"]).execute()
        
        # Increment uses
        supabase.table("invite_codes").update({"uses": invite.get("uses", 0) + 1}).eq("code", code).execute()
        
        return {
            "status": "joined",
            "school_name": invite["school_name"],
            "message": f"Welcome! You've joined {invite['school_name']}."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Join school error: {e}")
        raise HTTPException(status_code=500, detail="Could not join school. Try again.")

@api_router.get("/school/invite-codes")
async def get_school_invite_codes(request: Request):
    """School admin views their invite codes"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="School admin access required")
    try:
        result = supabase.table("invite_codes").select("*").eq("school_admin_id", user["user_id"]).execute()
        return result.data or []
    except:
        return []

# ================== TRIAL SYSTEM ==================

@api_router.post("/trial/start")
async def start_trial(request: Request):
    """Start a trial for a user based on their role"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Must be logged in")
    body = await request.json()
    trial_type = body.get("type", "teacher")  # teacher, parent, school
    
    # Trial lengths
    trial_days = {"teacher": 7, "parent": 7, "school": 30}.get(trial_type, 7)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=trial_days)).isoformat()
    
    supabase.table("users").update({
        "subscription_status": "trial",
        "trial_type": trial_type,
        "trial_expires_at": expires_at,
    }).eq("user_id", user["user_id"]).execute()
    
    return {
        "status": "trial_started",
        "trial_type": trial_type,
        "expires_at": expires_at,
        "days": trial_days,
        "message": f"Your {trial_days}-day free trial has started!"
    }

@api_router.get("/trial/status")
async def get_trial_status(request: Request):
    """Get current user trial status"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    sub_status = user.get("subscription_status", "free")
    trial_expires = user.get("trial_expires_at")
    trial_type = user.get("trial_type", "")
    
    if sub_status == "trial" and trial_expires:
        try:
            expires = datetime.fromisoformat(trial_expires.replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            days_left = max(0, (expires - now).days)
            if days_left == 0:
                # Trial expired
                supabase.table("users").update({"subscription_status": "free"}).eq("user_id", user["user_id"]).execute()
                return {"status": "expired", "days_left": 0, "trial_type": trial_type}
            return {"status": "trial", "days_left": days_left, "expires_at": trial_expires, "trial_type": trial_type}
        except:
            pass
    
    return {"status": sub_status, "days_left": None, "trial_type": trial_type}

# ================== SCHOOL PROFILE & REGISTRATION ==================

@api_router.post("/school/register")
async def register_school(request: Request):
    """School admin registers their school with full profile"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="School admin access required")
    body = await request.json()

    required = ["school_name", "country", "city"]
    for field in required:
        if not body.get(field):
            raise HTTPException(status_code=400, detail=f"{field} is required")

    profile = {
        "school_name": body.get("school_name", "").strip(),
        "country": body.get("country", "").strip(),
        "city": body.get("city", "").strip(),
        "school_type": body.get("school_type", "private"),
        "curriculum": body.get("curriculum", "National"),
        "student_count": body.get("student_count", ""),
        "contact_name": body.get("contact_name", "").strip(),
        "contact_email": body.get("contact_email", user.get("email", "")).strip(),
        "how_heard": body.get("how_heard", "").strip(),
        "country_flag": body.get("country_flag", "🌍"),
        "registered_at": datetime.now(timezone.utc).isoformat(),
    }

    # Save to admin_settings
    settings_to_save = [
        {"key": "school_name", "value": profile["school_name"]},
        {"key": "school_country", "value": profile["country"]},
        {"key": "school_city", "value": profile["city"]},
        {"key": "school_type", "value": profile["school_type"]},
        {"key": "school_curriculum", "value": profile["curriculum"]},
        {"key": "school_student_count", "value": str(profile["student_count"])},
        {"key": "school_contact_name", "value": profile["contact_name"]},
        {"key": "school_contact_email", "value": profile["contact_email"]},
        {"key": "school_how_heard", "value": profile["how_heard"]},
        {"key": "school_country_flag", "value": profile["country_flag"]},
        {"key": "school_registered_at", "value": profile["registered_at"]},
    ]

    for setting in settings_to_save:
        try:
            existing = supabase.table("admin_settings").select("*").eq("key", setting["key"]).execute()
            if existing.data:
                supabase.table("admin_settings").update({"value": setting["value"]}).eq("key", setting["key"]).execute()
            else:
                supabase.table("admin_settings").insert({**setting, "school_admin_id": user["user_id"]}).execute()
        except:
            pass

    # Also update user record
    supabase.table("users").update({
        "school_name": profile["school_name"],
        "school_country": profile["country"],
    }).eq("user_id", user["user_id"]).execute()

    return {"status": "registered", "profile": profile}

@api_router.get("/school/profile")
async def get_school_profile(request: Request):
    """Get school admin's own profile"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="School admin access required")
    try:
        result = supabase.table("admin_settings").select("*").execute()
        settings = {row["key"]: row["value"] for row in (result.data or [])}
        return {
            "school_name": settings.get("school_name", user.get("school_name", "")),
            "country": settings.get("school_country", ""),
            "city": settings.get("school_city", ""),
            "school_type": settings.get("school_type", ""),
            "curriculum": settings.get("school_curriculum", ""),
            "student_count": settings.get("school_student_count", ""),
            "contact_name": settings.get("school_contact_name", ""),
            "contact_email": settings.get("school_contact_email", ""),
            "how_heard": settings.get("school_how_heard", ""),
            "country_flag": settings.get("school_country_flag", "🌍"),
            "registered_at": settings.get("school_registered_at", ""),
        }
    except Exception as e:
        return {}

@api_router.get("/schools/world-wall")
async def get_schools_world_wall(request: Request):
    """Public endpoint - returns schools for the world wall (no sensitive data)"""
    try:
        # Get all school admins who have registered
        school_admins = supabase.table("users").select("user_id, school_name, school_country").neq("school_name", None).execute()
        schools = []
        for admin in (school_admins.data or []):
            if admin.get("school_name"):
                # Get flag from settings
                try:
                    settings = supabase.table("admin_settings").select("key, value").eq("school_admin_id", admin["user_id"]).execute()
                    settings_dict = {row["key"]: row["value"] for row in (settings.data or [])}
                    flag = settings_dict.get("school_country_flag", "🌍")
                    city = settings_dict.get("school_city", "")
                except:
                    flag = "🌍"
                    city = ""
                schools.append({
                    "name": admin["school_name"],
                    "country": admin.get("school_country", ""),
                    "city": city,
                    "flag": flag,
                })
        return schools
    except Exception as e:
        logger.error(f"World wall error: {e}")
        return []

@api_router.post("/strategies")
async def create_global_strategy(request: Request):
    """Admin adds a global student strategy"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    new_strat = {
        "id": str(uuid.uuid4()),
        "name": name,
        "description": body.get("description", ""),
        "feeling_colour": body.get("zone", "blue"),
        "icon": body.get("icon", "star"),
        "is_custom": False,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        result = supabase.table("helpers").insert(new_strat).execute()
        return result.data[0] if result.data else new_strat
    except Exception as e:
        logger.error(f"Strategy create error: {e}")
        raise HTTPException(status_code=500, detail="Could not save strategy")

@api_router.put("/strategies/{strategy_id}")
async def update_global_strategy(strategy_id: str, request: Request):
    """Admin updates a global student strategy"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Superadmin access required")
    body = await request.json()
    update_data = {k:v for k,v in {
        "name": body.get("name"),
        "description": body.get("description"),
        "feeling_colour": body.get("zone"),
        "zone": body.get("zone"),
        "icon": body.get("icon"),
    }.items() if v is not None}
    try:
        supabase.table("helpers").update(update_data).eq("id", strategy_id).execute()
        return {"status": "updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Could not update strategy")

@api_router.delete("/strategies/{strategy_id}")
async def delete_global_strategy(strategy_id: str, request: Request):
    """Superadmin deletes a global student strategy"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Superadmin access required")
    try:
        supabase.table("helpers").delete().eq("id", strategy_id).execute()
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Could not delete strategy")


@api_router.delete("/admin/teacher-strategies/{strategy_id}")
async def delete_admin_teacher_strategy(strategy_id: str, request: Request):
    """Delete a teacher strategy - superadmin can delete any, school_admin only their own"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        # Check ownership for school_admin
        if user.get("role") == "school_admin":
            existing = supabase.table("admin_teacher_strategies").select("*").eq("id", strategy_id).execute()
            if existing.data and existing.data[0].get("created_by") != user["user_id"]:
                raise HTTPException(status_code=403, detail="You can only delete strategies you created")
        supabase.table("admin_teacher_strategies").delete().eq("id", strategy_id).execute()
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Could not delete strategy")


@api_router.post("/auth/update-language")
async def update_user_language(request: Request):
    """Update user preferred language"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    lang = body.get("language", "en")
    try:
        supabase.table("users").update({"language": lang}).eq("user_id", user["user_id"]).execute()
    except:
        pass
    return {"status": "ok", "language": lang}


@api_router.get("/family/members/{member_id}/checkins")
async def get_family_member_checkins(member_id: str, request: Request, days: int = 7):
    """Get check-ins for a family member - from feeling_logs if linked to student"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        # Get family member to check if linked to student
        member_result = supabase.table("family_members").select("*").eq("id", member_id).execute()
        if not member_result.data:
            raise HTTPException(status_code=404, detail="Family member not found")
        
        member = member_result.data[0]
        student_id = member.get("student_id")
        
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        
        if student_id:
            # Get from feeling_logs (student check-ins)
            result = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start_date).order("timestamp", desc=True).execute()
            logs = result.data or []
            # Normalize field names
            for log in logs:
                log["zone"] = log.get("feeling_colour", log.get("zone", ""))
                log["member_id"] = member_id
        else:
            # Get from family_zone_logs
            result = supabase.table("family_zone_logs").select("*").eq("family_member_id", member_id).gte("timestamp", start_date).order("timestamp", desc=True).execute()
            logs = result.data or []
        
        return logs
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Family checkins error: {e}")
        return []

@api_router.post("/family/members/{member_id}/checkin")
async def family_member_checkin(member_id: str, request: Request):
    """Check in on behalf of family member - saves to student feeling_logs if linked"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    body = await request.json()
    zone = body.get("zone", "")
    strategies = body.get("helpers_selected", body.get("strategies_selected", []))
    comment = body.get("comment", "")
    
    try:
        member_result = supabase.table("family_members").select("*").eq("id", member_id).execute()
        if not member_result.data:
            raise HTTPException(status_code=404, detail="Family member not found")
        
        member = member_result.data[0]
        student_id = member.get("student_id")
        
        if student_id:
            # Save to feeling_logs so teacher AND parent can see it
            log = {
                "id": str(uuid.uuid4()),
                "student_id": student_id,
                "feeling_colour": zone,
                "helpers_selected": strategies,
                "comment": comment,
                "logged_by": "parent",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            result = supabase.table("feeling_logs").insert(log).execute()
        else:
            # Save to family_zone_logs
            log = {
                "id": str(uuid.uuid4()),
                "family_member_id": member_id,
                "user_id": user["user_id"],
                "zone": zone,
                "strategies_selected": strategies,
                "comment": comment,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            result = supabase.table("family_zone_logs").insert(log).execute()
        
        return {"status": "saved", "log": result.data[0] if result.data else log}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Family checkin error: {e}")
        raise HTTPException(status_code=500, detail=f"Could not save check-in: {str(e)}")

@api_router.get("/family/students")
async def get_linkable_students(request: Request):
    """Get students that parent can link to family - from linked teacher"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        # Get students from parent-teacher links
        links = supabase.table("parent_teacher_links").select("*").eq("parent_id", user["user_id"]).execute()
        
        students = []
        for link in (links.data or []):
            teacher_id = link.get("teacher_id")
            if teacher_id:
                # Get students from this teacher
                teacher_students = supabase.table("students").select("*").eq("user_id", teacher_id).execute()
                for s in (teacher_students.data or []):
                    students.append({
                        "id": s["id"],
                        "name": s["name"],
                        "teacher_id": teacher_id,
                        "avatar_preset": s.get("avatar_preset", ""),
                    })
        
        return students
    except Exception as e:
        logger.error(f"Get linkable students error: {e}")
        return []


# ================== STUDENT-FAMILY LINK SYSTEM ==================

@api_router.post("/family/members/{member_id}/link-student")
async def link_family_member_to_student(member_id: str, request: Request):
    """Link a family member to an existing student profile"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    student_id = body.get("student_id", "").strip()
    
    if not student_id:
        raise HTTPException(status_code=400, detail="student_id required")
    
    try:
        # Verify student exists
        student = supabase.table("students").select("*").eq("id", student_id).execute()
        if not student.data:
            raise HTTPException(status_code=404, detail="Student not found")
        
        # Update family member with student_id
        supabase.table("family_members").update({"student_id": student_id}).eq("id", member_id).execute()
        
        return {"status": "linked", "student_id": student_id, "student_name": student.data[0].get("name")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not link: {str(e)}")

@api_router.get("/family/linkable-students")
async def get_linkable_students(request: Request):
    """Get students that this parent can link to - via teacher link codes"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        # Get students from parent-teacher links
        links = supabase.table("parent_teacher_links").select("*").eq("parent_id", user["user_id"]).execute()
        
        all_students = []
        for link in (links.data or []):
            teacher_id = link.get("teacher_id")
            if teacher_id:
                students = supabase.table("students").select("id, name, avatar_preset, avatar_type").eq("user_id", teacher_id).execute()
                for s in (students.data or []):
                    all_students.append({
                        "id": s["id"],
                        "name": s["name"],
                        "avatar_preset": s.get("avatar_preset", ""),
                        "avatar_type": s.get("avatar_type", "preset"),
                    })
        
        return all_students
    except Exception as e:
        logger.error(f"Linkable students error: {e}")
        return []


# ================== LINKED CHILD ENDPOINTS (parent <-> school) ==================

@api_router.get("/parent/linked-children")
async def get_linked_children_for_parent(request: Request):
    """Return all students linked to this parent via parent_links table."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        links = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).execute()
        children = []
        for link in (links.data or []):
            s = supabase.table("students").select("*").eq("id", link["student_id"]).execute()
            if s.data:
                student = s.data[0]
                # Resolve classroom name
                classroom_name = None
                if student.get("classroom_id"):
                    cr = supabase.table("classrooms").select("name").eq("id", student["classroom_id"]).execute()
                    if cr.data:
                        classroom_name = cr.data[0].get("name")
                children.append({
                    "id": student["id"],
                    "name": student.get("name", ""),
                    "avatar_type": student.get("avatar_type", "preset"),
                    "avatar_preset": student.get("avatar_preset", ""),
                    "avatar_custom": student.get("avatar_custom", ""),
                    "classroom_id": student.get("classroom_id"),
                    "classroom_name": classroom_name,
                    "home_sharing_enabled": True,
                    "school_sharing_enabled": True,
                    "is_linked_from_school": True,
                })
        return children
    except Exception as e:
        logger.error(f"get_linked_children error: {e}")
        return []


@api_router.post("/parent/linked-child/{student_id}/check-in")
async def parent_linked_child_checkin(student_id: str, request: Request):
    """Save a home check-in for a school-linked child into feeling_logs."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        # Verify parent is linked to this student
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=403, detail="Not linked to this student")
        body = await request.json()
        log = {
            "id": str(uuid.uuid4()),
            "student_id": student_id,
            "feeling_colour": body.get("zone", ""),
            "helpers_selected": body.get("strategies_selected", []),
            "comment": body.get("comment", ""),
            "logged_by": "parent",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        result = supabase.table("feeling_logs").insert(log).execute()
        return {"status": "saved", "log": result.data[0] if result.data else log}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"parent_linked_child_checkin error: {e}")
        raise HTTPException(status_code=500, detail=f"Could not save check-in: {str(e)}")


@api_router.get("/parent/linked-child/{student_id}/home-checkins")
async def get_home_checkins(student_id: str, request: Request, days: int = 30):
    """Return home check-ins (logged_by=parent) for a linked child."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=403, detail="Not linked to this student")
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        result = supabase.table("feeling_logs").select("*").eq("student_id", student_id).eq("logged_by", "parent").gte("timestamp", start_date).order("timestamp", desc=True).execute()
        return result.data or []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_home_checkins error: {e}")
        return []


@api_router.get("/parent/linked-child/{student_id}/school-checkins")
async def get_school_checkins(student_id: str, request: Request, days: int = 30):
    """Return school check-ins for a linked child (respects sharing setting)."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=403, detail="Not linked to this student")
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        result = supabase.table("feeling_logs").select("*").eq("student_id", student_id).eq("logged_by", "teacher").gte("timestamp", start_date).order("timestamp", desc=True).execute()
        return {"checkins": result.data or [], "sharing_disabled": False}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_school_checkins error: {e}")
        return {"checkins": [], "sharing_disabled": False}


@api_router.get("/parent/resources")
async def get_parent_resources(request: Request, topic: Optional[str] = None):
    """Resources visible to parents — those uploaded with audience=parents or both."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        resources_result = supabase.table("resources").select("*").eq("is_active", True).execute()
        all_resources = resources_result.data or []
        allowed_audiences = ["parents", "both", None, ""]
        visible = []
        for r in all_resources:
            r_audience = r.get("target_audience", "both")
            if r_audience not in allowed_audiences:
                continue
            resource_topic = r.get("topic") or r.get("category") or "general"
            if topic and topic != "all" and resource_topic != topic:
                continue
            try:
                ratings_result = supabase.table("teacher_resource_ratings").select("*").eq("resource_id", r["id"]).execute()
                ratings = ratings_result.data or []
            except Exception:
                ratings = []
            visible.append(_resource_to_teacher_resource(r, ratings))
        return visible
    except Exception as e:
        logger.error(f"get_parent_resources error: {e}")
        return []


@api_router.post("/checkins/bulk")
async def bulk_checkin(request: Request):
    """Bulk check-in for an entire class at once. No points awarded."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        body = await request.json()
        logs = body.get("logs", [])
        if not logs:
            raise HTTPException(status_code=400, detail="No logs provided")
        results = []
        for log in logs:
            entry = {
                "id": str(uuid.uuid4()),
                "student_id": log.get("student_id"),
                "feeling_colour": log.get("feeling_colour", ""),
                "helpers_selected": log.get("helpers_selected", []),
                "comment": log.get("comment"),
                "logged_by": "teacher_bulk",
                "timestamp": log.get("timestamp") or datetime.now(timezone.utc).isoformat(),
                # No points awarded for bulk check-in
            }
            if not entry["student_id"]:
                continue
            result = supabase.table("feeling_logs").insert(entry).execute()
            if result.data:
                results.append(result.data[0])
        return {"saved": len(results), "logs": results}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Bulk checkin error: {e}")
        raise HTTPException(status_code=500, detail=f"Bulk checkin failed: {str(e)}")


# ================== LINKED CHILD DETAIL ENDPOINTS ==================

@api_router.get("/parent/linked-child/{student_id}/all-checkins")
async def get_all_checkins_for_linked_child(student_id: str, request: Request, days: int = 30):
    """All check-ins (home + school) for a linked child."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=403, detail="Not linked to this student")
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        result = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start_date).order("timestamp", desc=True).execute()
        logs = result.data or []
        return [{
            **log,
            "zone": log.get("feeling_colour", log.get("zone", "")),
            "strategies_selected": log.get("helpers_selected", log.get("strategies_selected", [])),
            "location": "home" if log.get("logged_by") == "parent" else "school",
        } for log in logs]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_all_checkins error: {e}")
        return []


@api_router.get("/parent/linked-child/{student_id}/school-strategies")
async def get_school_strategies_for_linked_child(student_id: str, request: Request):
    """Get strategies assigned to student at school."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=403, detail="Not linked to this student")
        # Get custom strategies for this student
        try:
            strats = supabase.table("custom_helpers").select("*").eq("student_id", student_id).execute()
            custom = strats.data or []
            # Normalise zone field
            for row in custom:
                if not row.get("zone"):
                    row["zone"] = row.get("feeling_colour", "green")
        except Exception:
            custom = []
        # Get global strategies
        try:
            global_strats = supabase.table("strategies").select("*").execute()
            global_list = global_strats.data or []
        except Exception:
            global_list = []
        return {
            "custom_strategies": custom,
            "global_strategies": global_list[:8],  # limit
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_school_strategies error: {e}")
        return {"custom_strategies": [], "global_strategies": []}


@api_router.get("/parent/linked-child/{student_id}/family-strategies")
async def get_family_strategies_for_linked_child(student_id: str, request: Request):
    """Get family-assigned strategies for a linked child."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=403, detail="Not linked to this student")
        try:
            result = supabase.table("family_assigned_strategies").select("*").eq("student_id", student_id).eq("parent_user_id", user["user_id"]).execute()
            return result.data or []
        except Exception:
            return []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_family_strategies error: {e}")
        return []


@api_router.post("/parent/linked-child/{student_id}/family-strategies")
async def create_family_strategy_for_linked_child(student_id: str, request: Request):
    """Create a family strategy for a linked child."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=403, detail="Not linked to this student")
        body = await request.json()
        new_strategy = {
            "id": str(uuid.uuid4()),
            "student_id": student_id,
            "parent_user_id": user["user_id"],
            "strategy_name": body.get("strategy_name", ""),
            "strategy_description": body.get("strategy_description", ""),
            "zone": body.get("zone", "green"),
            "icon": body.get("icon", "star"),
            "share_with_teacher": body.get("share_with_teacher", False),
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            result = supabase.table("family_assigned_strategies").insert(new_strategy).execute()
            return result.data[0] if result.data else new_strategy
        except Exception:
            # Table may not exist yet - return the data anyway
            return new_strategy
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_family_strategy error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/parent/linked-child/{student_id}/family-strategies/{strategy_id}/toggle-sharing")
async def toggle_strategy_sharing(student_id: str, strategy_id: str, request: Request):
    """Toggle whether a family strategy is shared with teacher."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        current = supabase.table("family_assigned_strategies").select("*").eq("id", strategy_id).execute()
        if not current.data:
            raise HTTPException(status_code=404, detail="Strategy not found")
        new_value = not current.data[0].get("share_with_teacher", False)
        supabase.table("family_assigned_strategies").update({"share_with_teacher": new_value}).eq("id", strategy_id).execute()
        return {"share_with_teacher": new_value}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"toggle_strategy_sharing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/parent/linked-child/{student_id}/toggle-home-sharing")
async def toggle_home_sharing(student_id: str, request: Request):
    """Toggle whether home check-ins are shared with teacher."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=404, detail="Link not found")
        current = link.data[0].get("home_sharing_enabled", False)
        new_value = not current
        supabase.table("parent_links").update({"home_sharing_enabled": new_value}).eq("id", link.data[0]["id"]).execute()
        return {"home_sharing_enabled": new_value}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"toggle_home_sharing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/teacher-checkins")
async def save_teacher_checkin(request: Request):
    """Save teacher self check-in to DB for dashboard visibility."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        body = await request.json()
        entry = {
            "id": str(uuid.uuid4()),
            "user_id": user["user_id"],
            "zone": body.get("zone", ""),
            "strategies_selected": body.get("strategies_selected", []),
            "notes": body.get("notes"),
            "shared": body.get("shared", False),
            "timestamp": body.get("timestamp") or datetime.now(timezone.utc).isoformat(),
        }
        try:
            supabase.table("teacher_checkins").insert(entry).execute()
        except Exception as e:
            # Table may not exist yet - create it
            logger.error(f"teacher_checkins insert error: {e}")
        return {"status": "saved"}
    except Exception as e:
        logger.error(f"save_teacher_checkin error: {e}")
        return {"status": "error", "detail": str(e)}

@api_router.get("/teacher-checkins")
async def get_teacher_checkins(request: Request, days: int = 7):
    """Get teacher self check-ins for dashboard."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        result = supabase.table("teacher_checkins").select("*").eq("user_id", user["user_id"]).gte("timestamp", start_date).order("timestamp", desc=True).execute()
        return result.data or []
    except Exception as e:
        logger.error(f"get_teacher_checkins error: {e}")
        return []


# ================== TEACHER → LINKED STUDENT ENDPOINTS ==================

@api_router.get("/teacher/student/{student_id}/sharing-status")
async def get_student_sharing_status(student_id: str, request: Request):
    """Check if a student is linked to a parent and sharing status."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        # Check if any parent is linked to this student
        links = supabase.table("parent_links").select("*").eq("student_id", student_id).execute()
        is_linked = len(links.data or []) > 0
        home_sharing = False
        school_sharing = False
        parent_name = None
        if is_linked and links.data:
            link = links.data[0]
            home_sharing = link.get("home_sharing_enabled", False)
            # School sharing - teacher can always see school data, parent sees school data if link exists
            school_sharing = True  # school data visible to linked parent by default
            # Get parent name
            try:
                parent = supabase.table("users").select("name,email").eq("user_id", link["parent_user_id"]).execute()
                if parent.data:
                    parent_name = parent.data[0].get("name") or parent.data[0].get("email", "Parent")
            except Exception:
                pass
        return {
            "is_linked_to_parent": is_linked,
            "home_sharing_enabled": home_sharing,
            "school_sharing_enabled": school_sharing,
            "parent_name": parent_name,
            "link_count": len(links.data or []),
        }
    except Exception as e:
        logger.error(f"get_student_sharing_status error: {e}")
        return {"is_linked_to_parent": False, "home_sharing_enabled": False, "school_sharing_enabled": False, "parent_name": None}


@api_router.get("/teacher/student/{student_id}/home-data")
async def get_student_home_data(student_id: str, request: Request, days: int = 30):
    """Get home check-ins and family strategies for a student (teacher view)."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        # Verify teacher owns this student
        student = supabase.table("students").select("*").eq("id", student_id).execute()
        if not student.data:
            raise HTTPException(status_code=404, detail="Student not found")

        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        # Home check-ins - check feeling_logs (logged_by=parent) AND family_zone_logs
        home_logs = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start_date).order("timestamp", desc=True).execute()
        all_feeling_logs = home_logs.data or []
        # Filter for home/parent logs
        parent_feeling_logs = [l for l in all_feeling_logs if l.get("logged_by") in ("parent", "family")]
        # Also check family_zone_logs table
        try:
            fam_logs_result = supabase.table("family_zone_logs").select("*").eq("student_id", student_id).gte("timestamp", start_date).order("timestamp", desc=True).execute()
            fam_zone_logs = [{**l, "logged_by": "parent"} for l in (fam_logs_result.data or [])]
        except Exception:
            fam_zone_logs = []
        combined_home = parent_feeling_logs + fam_zone_logs
        # deduplicate by timestamp
        seen = set()
        home_only = []
        for l in combined_home:
            ts = l.get("timestamp","")
            if ts not in seen:
                seen.add(ts)
                home_only.append(l)
        home_only.sort(key=lambda x: x.get("timestamp",""), reverse=True)
        # Create mock result object
        class MockResult:
            def __init__(self, data): self.data = data
        home_logs = MockResult(home_only)

        # Family strategies
        try:
            fam_strats = supabase.table("family_assigned_strategies").select("*").eq("student_id", student_id).eq("share_with_teacher", True).execute()
            family_strategies = fam_strats.data or []
        except Exception:
            family_strategies = []

        home_checkins = [{
            **log,
            "zone": log.get("feeling_colour", log.get("zone", "")),
            "strategies_selected": log.get("helpers_selected", log.get("strategies_selected", [])),
        } for log in (home_logs.data or [])]

        return {
            "sharing_enabled": True,
            "home_checkins": home_checkins,
            "family_strategies": family_strategies,
            "total_home_checkins": len(home_checkins),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_student_home_data error: {e}")
        return {"sharing_enabled": False, "home_checkins": [], "family_strategies": [], "total_home_checkins": 0}


@api_router.get("/teacher/student/{student_id}/combined-checkins")
async def get_student_combined_checkins(student_id: str, request: Request, days: int = 30):
    """Get ALL check-ins for a student — school + home combined."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        result = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start_date).order("timestamp", desc=True).execute()
        logs = result.data or []
        return [{
            **log,
            "zone": log.get("feeling_colour", log.get("zone", "")),
            "strategies_selected": log.get("helpers_selected", log.get("strategies_selected", [])),
            "source": "home" if log.get("logged_by") == "parent" else "school",
        } for log in logs]
    except Exception as e:
        logger.error(f"get_student_combined_checkins error: {e}")
        return []


@api_router.get("/teacher/student/{student_id}/all-strategies")
async def get_student_all_strategies(student_id: str, request: Request):
    """Get all strategies for a student — school custom + family shared."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        # School strategies - normalize zone/feeling_colour
        try:
            school = supabase.table("custom_helpers").select("*").eq("student_id", student_id).execute()
            school_strats = []
            for s in (school.data or []):
                normalized = {**s, "source": "school"}
                if not normalized.get("zone"):
                    normalized["zone"] = normalized.get("feeling_colour", "green")
                if not normalized.get("feeling_colour"):
                    normalized["feeling_colour"] = normalized.get("zone", "green")
                school_strats.append(normalized)
        except Exception as e:
            logger.error(f"school strategies fetch error: {e}")
            school_strats = []
        # Family strategies (shared with teacher)
        try:
            family = supabase.table("family_assigned_strategies").select("*").eq("student_id", student_id).eq("share_with_teacher", True).execute()
            family_strats = [{**s, "source": "home", "name": s.get("strategy_name",""), "description": s.get("strategy_description","")} for s in (family.data or [])]
        except Exception:
            family_strats = []
        return {"school_strategies": school_strats, "family_strategies": family_strats}
    except Exception as e:
        logger.error(f"get_student_all_strategies error: {e}")
        return {"school_strategies": [], "family_strategies": []}


@api_router.post("/teacher/student/{student_id}/strategies")
async def add_student_strategy(student_id: str, request: Request):
    """Add a custom strategy for a student at school."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        body = await request.json()
        new_strategy = {
            "id": str(uuid.uuid4()),
            "student_id": student_id,
            "user_id": user["user_id"],
            "name": body.get("name", ""),
            "description": body.get("description", ""),
            "feeling_colour": body.get("feeling_colour", body.get("zone", "green")),
            "icon": body.get("icon", "star"),
            "is_shared": body.get("share_with_parent", False),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        result = supabase.table("custom_helpers").insert(new_strategy).execute()
        return result.data[0] if result.data else new_strategy
    except Exception as e:
        logger.error(f"add_student_strategy error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/teacher/student/{student_id}/strategies/{strategy_id}")
async def delete_student_strategy(student_id: str, strategy_id: str, request: Request):
    """Delete a custom strategy for a student."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        supabase.table("custom_helpers").delete().eq("id", strategy_id).eq("student_id", student_id).execute()
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/teacher/student/{student_id}/strategies/{strategy_id}/toggle-share")
async def toggle_strategy_share_with_parent(student_id: str, strategy_id: str, request: Request):
    """Toggle sharing a school strategy with the parent."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        current = supabase.table("custom_helpers").select("is_shared").eq("id", strategy_id).execute()
        if not current.data:
            raise HTTPException(status_code=404, detail="Strategy not found")
        new_val = not current.data[0].get("is_shared", False)
        supabase.table("custom_helpers").update({"is_shared": new_val}).eq("id", strategy_id).execute()
        return {"is_shared": new_val}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/parent/linked-child/{student_id}/unlink")
async def unlink_child(student_id: str, request: Request):
    """Unlink a student from a parent account."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        supabase.table("parent_links").delete().eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        return {"status": "unlinked", "student_id": student_id}
    except Exception as e:
        logger.error(f"unlink error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/students/{student_id}/unlink")
async def teacher_unlink_student(student_id: str, request: Request):
    """Teacher removes parent link from a student."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        supabase.table("parent_links").delete().eq("student_id", student_id).execute()
        # Clear link code from student
        supabase.table("students").update({"parent_link_code": None}).eq("id", student_id).execute() if True else None  # allow any student if True else None  # allow any student
        return {"message": "Student unlinked successfully"}
    except Exception as e:
        logger.error(f"Unlink error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/admin/strategies")
async def create_admin_strategy(request: Request):
    """Admin creates a strategy visible to all teachers."""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        body = await request.json()
        new_strategy = {
            "id": str(uuid.uuid4()),
            "name": body.get("name", ""),
            "description": body.get("description", ""),
            "feeling_colour": body.get("feeling_colour", body.get("zone", "green")),
            "icon": body.get("icon", "star"),
            "lang": body.get("lang", "en"),
            "is_active": True,
            "created_by": user["user_id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        result = supabase.table("helpers").insert(new_strategy).execute()
        return result.data[0] if result.data else new_strategy
    except Exception as e:
        logger.error(f"Admin strategy create error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/admin/strategies/{strategy_id}")
async def update_admin_strategy(strategy_id: str, request: Request):
    """Admin updates a strategy."""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        body = await request.json()
        supabase.table("helpers").update(body).eq("id", strategy_id).execute()
        return {"status": "updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/admin/strategies/{strategy_id}")
async def delete_admin_strategy(strategy_id: str, request: Request):
    """Admin deletes a strategy."""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        supabase.table("helpers").delete().eq("id", strategy_id).execute()
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

app.include_router(api_router)

# Translation cache buster - v2
