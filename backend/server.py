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
        "blue_feelings": "Blue Feelings",
        "green_feelings": "Green Feelings",
        "yellow_feelings": "Yellow Feelings",
        "red_feelings": "Red Feelings",
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
        "blue_label": "Peu d\'énergie", "green_label": "Calme et prêt",
        "yellow_label": "Stressé", "red_label": "Surchargé",
        "tired": "Fatigué", "sad": "Triste", "bored": "Ennuyé", "lonely": "Seul",
        "calm": "Calme", "happy": "Heureux", "focused": "Concentré", "ready_to_learn": "Prêt",
        "hi": "Salut", "need_help": "Besoin d\'aide? Touche ici!",
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
    """Enhanced stats with daily breakdown for graphs"""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")

    try:
        from datetime import datetime, timezone, timedelta

        now = datetime.now(timezone.utc)
        week_ago = (now - timedelta(days=7)).isoformat()
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
            r1 = supabase.table("zone_logs").select("*").gte("timestamp", week_ago).execute()
            logs.extend(r1.data or [])
        except: pass
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

        # Support requests
        try:
            alerts_result = supabase.table("wellbeing_alerts").select("*").gte("created_at", month_ago).execute()
            support_requests = len(alerts_result.data or [])
        except:
            support_requests = 0

        # Top strategy
        strategy_counts = {}
        for log in logs:
            for s in (log.get("strategies_selected") or []):
                strategy_counts[s] = strategy_counts.get(s, 0) + 1
        top_strategy = max(strategy_counts, key=strategy_counts.get) if strategy_counts else "—"

        # Schools breakdown
        try:
            school_admins = supabase.table("users").select("*").eq("role", "school_admin").execute()
            schools_breakdown = []
            for admin in (school_admins.data or []):
                school_logs = supabase.table("zone_logs").select("zone").gte("timestamp", week_ago).execute()
                school_zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
                for log in (school_logs.data or []):
                    z = log.get("zone", "")
                    if z in school_zone_counts:
                        school_zone_counts[z] += 1
                # Get school settings
                settings = supabase.table("admin_settings").select("*").execute()
                settings_dict = {row["key"]: row["value"] for row in (settings.data or [])}
                schools_breakdown.append({
                    "name": settings_dict.get("school_name") or admin.get("school_name") or admin.get("email", "Unknown"),
                    "description": settings_dict.get("school_description", ""),
                    "total_checkins": len(school_logs.data or []),
                    "zone_counts": school_zone_counts,
                })
            total_schools = len(schools_breakdown)
        except:
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
        logger.error(f"Stats error: {e}")
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


@api_router.get("/teacher-resources")  # audience filter supported  # audience filter supported
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
    if len(content) > 800000:
        raise HTTPException(status_code=413, detail="File too large. Please use a PDF under 500KB.")
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
        try:
            fallback = {k: v for k, v in resource_data.items() if k not in ["topic", "target_audience", "pdf_filename"]}
            result = supabase.table("resources").insert(fallback).execute()
            return result.data[0] if result.data else resource_data
        except Exception as e2:
            raise HTTPException(status_code=500, detail="Failed to save resource")

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

app.include_router(api_router)

# Translation cache buster - v2
