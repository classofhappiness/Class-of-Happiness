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
        "app_name": "Classe da Felicidade",
        "how_are_you_feeling": "Como você está se sentindo?",
        "tap_colour_help": "Toque na cor que corresponde ao seu sentimento",
        "choose_helpers": "Escolha seus ajudantes",
        "want_to_say": "Quer dizer como você se sente?",
        "write_sentence": "Escreva uma frase sobre como você se sente...",
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
        "loading_helpers": "Carregando ajudantes...",
        "loading_strategies": "Carregando ajudantes...",
        "tap_helpers_green": "Toca nos ajudantes que gostarias de experimentar:",
        "tap_helpers_other": "Toca para selecionar ajudantes:",
        "tap_strategies_green": "Toca nos ajudantes que gostarias de experimentar:",
        "tap_strategies_help": "Toca para selecionar ajudantes:",
        "great_job_title": "Trabalho Incrível!",
        "keep_it_up": "Continua assim!",
        "day_streak": "dias seguidos!",
        "points": "Pontos",
        "continue": "Continuar",
        "loading_creature": "Carregando a tua criatura...",
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
        "loading": "Carregando...",
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
        "blue_feelings": "Blue Feelings",
        "green_feelings": "Green Feelings",
        "yellow_feelings": "Yellow Feelings",
        "red_feelings": "Red Feelings",
        "blue_zone": "Blue Feelings",
        "green_zone": "Green Feelings",
        "yellow_zone": "Yellow Feelings",
        "red_zone": "Red Feelings",
        "blue_feeling": "Quiet Energy",
        "green_feeling": "Balanced Energy",
        "yellow_feeling": "Fizzing Energy",
        "red_feeling": "Big Energy",
        "blue_description": "Your body is moving slowly. You might feel tired, a bit sad, or need some rest.",
        "green_description": "You feel calm, happy and ready. This is a great feeling!",
        "yellow_description": "You are starting to feel wobbly. You might feel silly, nervous or frustrated.",
        "red_description": "Your body has big feelings right now. You might feel angry or out of control.",
        "what_colours_mean": "What do the colours mean?",
        "tired": "Tired",
        "sad": "Sad",
        "bored": "Bored",
        "lonely": "Lonely",
        "need_rest": "Need Rest",
        "calm": "Calm",
        "happy": "Happy",
        "focused": "Focused",
        "ready_to_learn": "Ready to Learn",
        "silly": "Silly",
        "frustrated": "Frustrated",
        "nervous": "Nervous",
        "worried": "Worried",
        "butterflies": "Butterflies",
        "super_charged": "Super-Charged",
        "very_upset": "Very Upset",
        "angry": "Angry",
        "out_of_control": "Out of Control",
        "explosive": "Explosive",
        "hi": "Hi",
        "need_help": "Need help? Tap here!",
        "support_message": "You can always ask a trusted adult or friend for help",
        "how_i_feel": "How I Feel",
        "my_helpers": "My Helpers",
        "my_creatures": "My Creatures",
        "feeling_chart": "Feeling Chart",
        "all_students": "All Students",
        "filter_by_classroom": "Filter by Classroom",
        "no_profiles_yet": "No profiles yet!",
        "create_first_profile": "Create your first profile to get started",
        "select_profile": "Select Your Profile",
        "tap_to_check_in": "Tap your picture to check in!",
        "add_profile": "Add Profile",
        "loading_helpers": "Loading helpers...",
        "loading_strategies": "Loading helpers...",
        "green_zone_help": "Great! Here are ways to keep feeling good:",
        "other_zone_help": "Here are some helpers that might help:",
        "tap_helpers_green": "Tap any helpers you would like to try:",
        "tap_helpers_other": "Tap to select helpers that might help:",
        "tap_strategies_green": "Tap any helpers you would like to try:",
        "tap_strategies_help": "Tap to select helpers that might help:",
        "great_job_title": "Amazing Job!",
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
        "fully_evolved": "Fully Evolved!",
        "keep_growing": "Keep Growing!",
        "grow_creature_hint": "Use helpers and share your feelings to evolve your creature!",
        "complete": "Complete!",
        "evolved": "EVOLVED!",
        "evolving": "EVOLVING...",
        "amazing_continue": "Amazing! Continue",
        "moves": "Moves",
        "outfits": "Outfits",
        "foods": "Foods",
        "homes": "Homes",
        "bonus_items": "Bonus Items",
        "your_creature": "Your Creature",
        "creature_collection": "My Creature Collection",
        "stage": "Stage",
        "unlocked": "Got it!",
        "points_needed": "points to next stage",
        "next_evolution": "Next Evolution",
        "settings": "Settings",
        "language": "Language",
        "about": "About",
        "login": "Sign In",
        "logout": "Sign Out",
        "confirm": "Confirm",
        "change_language": "Change Language",
        "language_changed": "Language Changed",
        "is_now_default": "is now your default language.",
        "i_am_a": "I am a...",
        "student": "Student",
        "teacher": "Teacher",
        "parent": "Parent/Family",
        "check_in_feelings": "Check in with my feelings",
        "view_progress": "View student progress",
        "loading": "Loading...",
        "save": "Save",
        "cancel": "Cancel",
        "delete": "Delete",
        "edit": "Edit",
        "back": "Back",
        "next": "Next",
        "done": "Done",
        "skip": "Skip",
        "days_7": "7 Days",
        "days_14": "2 Weeks",
        "days_30": "30 Days",
        "free_trial": "Free Trial",
        "free_trial_days": "7 Days Free Trial",
        "seven_days_free": "7 Days Free",
        "trial_days": "7",
        "start_free_trial": "Start Free Trial",
        "days_free": "days free",
        "subscribe": "Subscribe",
        "sign_in_google": "Sign in with Google",
        "have_trial_code": "Have a trial code?",
        "enter_trial_code": "Enter Trial Code",
        "trial_code_placeholder": "Enter your code here",
        "redeem_code": "Redeem Code",
        "redeeming": "Redeeming...",
        "trial_code_success": "Trial code redeemed successfully!",
        "trial_code_invalid": "Invalid trial code",
        "confirm_logout": "Are you sure you want to log out?",
        "subscription": "Subscription",
        "select_helpful_strategies": "Select helpful strategies",
        "loading_students": "Loading students...",
        "no_students": "No students yet",
        "classroom": "Classroom",
        "add_student": "Add Student",
        "student_name": "Student name",
        "create_profile": "Create Profile",
        "choose_avatar": "Choose Avatar",
        "link_code": "Link Code",
        "generate_link": "Generate Link Code",
        "home_check_ins": "Home Check-ins",
        "school_check_ins": "School Check-ins",
        "recent_helpers": "Recent Helpers",
        "no_data_yet": "No data yet",
        "view_all": "View All",
        "report": "Report",
        "download_pdf": "Download PDF",
        "sharing_enabled": "Sharing Enabled",
        "sharing_disabled": "Sharing Disabled",
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
    translations = TRANSLATIONS.get(lang, TRANSLATIONS["en"])
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
    resources = supabase.table("resources").select("*").execute()
    users_data = users.data or []
    teachers = [u for u in users_data if u.get("role") == "teacher"]
    parents = [u for u in users_data if u.get("role") == "parent"]
    return {
        "total_users": len(users_data),
        "total_teachers": len(teachers),
        "total_parents": len(parents),
        "total_students": len(students.data or []),
        "total_checkins": len(logs.data or []),
        "total_resources": len(resources.data or []),
    }


def _resource_to_teacher_resource(resource: dict, ratings: List[dict]):
    relevant = [r for r in ratings if r.get("resource_id") == resource.get("id")]
    avg = 0.0
    if relevant:
        avg = sum([int(r.get("rating", 0)) for r in relevant]) / len(relevant)
    return {
        "id": resource.get("id"),
        "title": resource.get("title", ""),
        "description": resource.get("description", ""),
        "topic": resource.get("topic") or resource.get("category") or "general",
        "content_type": resource.get("content_type", "text"),
        "content": resource.get("content"),
        "pdf_filename": resource.get("pdf_filename"),
        "created_by": resource.get("user_id", "system"),
        "created_by_name": resource.get("created_by_name") or "Class of Happiness",
        "average_rating": round(avg, 1),
        "total_ratings": len(relevant),
        "created_at": resource.get("created_at", datetime.now(timezone.utc).isoformat()),
    }


@api_router.get("/admin/resources")
async def get_admin_resources(request: Request):
    user = await get_current_user(request)
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    result = supabase.table("resources").select("*").order("created_at", desc=True).execute()
    return result.data or []


@api_router.post("/admin/resources")
async def create_admin_resource(request: Request):
    user = await get_current_user(request)
    if not user or user.get("role") != "admin":
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
    if not user or user.get("role") != "admin":
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
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    classrooms = supabase.table("classrooms").select("*").execute().data or []
    return [{"name": c.get("name", "Classroom"), "classroom_count": 1} for c in classrooms]


@api_router.get("/admin/export")
async def export_admin_data(request: Request, type: str = "checkins", format: str = "json"):
    user = await get_current_user(request)
    if not user or user.get("role") != "admin":
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
async def get_teacher_resources(request: Request, topic: Optional[str] = None):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    resources_result = supabase.table("resources").select("*").eq("is_active", True).execute()
    all_resources = resources_result.data or []

    visible = []
    for r in all_resources:
        audience = r.get("target_audience", "both")
        if audience not in ["teachers", "both", None, ""]:
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
    body = await request.json()
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    topic = body.get("topic") or body.get("category") or "general"
    resource_data = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "title": title,
        "description": body.get("description", ""),
        "content_type": body.get("content_type", "pdf"),
        "content": body.get("content"),
        "pdf_filename": body.get("pdf_filename"),
        "category": topic,
        "topic": topic,
        "target_audience": "teachers",
        "is_global": False,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        result = supabase.table("resources").insert(resource_data).execute()
    except Exception:
        fallback = {k: v for k, v in resource_data.items() if k not in ["topic", "target_audience"]}
        result = supabase.table("resources").insert(fallback).execute()
    return result.data[0] if result.data else resource_data


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
        all_creatures.append({
            **cdata,
            "current_points": creature_points.get(cid, 0),
            "current_stage": creature_stages.get(cid, 0),
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

app.include_router(api_router)

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
    if not user or user.get("role") not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    result = supabase.table("wellbeing_alerts").select("*").order("created_at", desc=True).execute()
    return result.data or []

@api_router.post("/admin/settings")
async def update_admin_setting(request: Request):
    """Admin updates a setting key/value pair"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin"]:
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
    if not user or user.get("role") not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    result = supabase.table("admin_settings").select("*").execute()
    return {row["key"]: row["value"] for row in (result.data or [])}

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
    if not user or user.get("role") not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    body = await request.json()
    new_strat = {
        "id": str(uuid.uuid4()),
        "zone": body.get("zone", "blue"),
        "name": body.get("name"),
        "description": body.get("description", ""),
        "icon": body.get("icon", "star"),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = supabase.table("admin_teacher_strategies").insert(new_strat).execute()
    return result.data[0] if result.data else new_strat


