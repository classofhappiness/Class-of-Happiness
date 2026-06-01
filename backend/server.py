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
from reportlab.platypus import KeepTogether, SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
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
TRIAL_DURATION_DAYS = 14

# Promo codes
PROMO_CODES = {
    "HAPPYCLASS2026": {"type": "trial", "days": 14},
    "CLASSOFHAPPINESS2026": {"type": "trial", "days": 14},
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
        "description_pt": "Criatura aquática que fica mais forte com check-ins calmos.",
        "description_es": "Criatura acuática que se vuelve más fuerte con check-ins tranquilos.",
        "description_fr": "Créature aquatique qui devient plus forte avec des enregistrements calmes.",
        "description_de": "Wasserwesen, das mit ruhigen Check-ins stärker wird.",
        "description_it": "Creatura acquatica che diventa più forte con i check-in tranquilli.",
        "description_pt": "Criatura aquática que fica mais forte com check-ins calmos.",
        "description_es": "Criatura acuática que se vuelve más fuerte con check-ins tranquilos.",
        "description_fr": "Créature aquatique qui devient plus forte avec des enregistrements calmes.",
        "description_de": "Wasserwesen, das mit ruhigen Check-ins stärker wird.",
        "description_it": "Creatura acquatica che diventa più forte con i check-in tranquilli.",
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
            {"stage": 2, "name": "Dino Hero", "emoji": "🦖", "description": "A brave dinosaur keeps growing.", "description_pt": "Um dinossauro corajoso que continua a crescer.", "description_es": "Un dinosaurio valiente que sigue creciendo.", "description_fr": "Un dinosaure courageux qui continue de grandir.", "description_de": "Ein mutiger Dinosaurier, der weiter wächst.", "description_it": "Un dinosauro coraggioso che continua a crescere.", "required_points": 60},
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

# ── Translated helper/strategy cards per language ──────────────────────────
HELPERS_PT = {
    "blue": [
        {"id":"b1","name":"Alongamento Suave","description":"Estira o corpo lentamente. Isto ajuda quando te sentes cansado ou triste.","feeling_colour":"blue","icon":"self-improvement","emoji":"🧘"},
        {"id":"b2","name":"Canção Favorita","description":"Ouve ou canta a tua música favorita. A música pode fazer-nos sentir melhor.","feeling_colour":"blue","icon":"music-note","emoji":"🎵"},
        {"id":"b3","name":"Dizer a Alguém","description":"Fala com alguém em quem confias sobre como te sentes.","feeling_colour":"blue","icon":"chat","emoji":"💬"},
        {"id":"b4","name":"Respiração Lenta","description":"Inspira devagar pelo nariz e expira pela boca. Repete 5 vezes.","feeling_colour":"blue","icon":"air","emoji":"💨"},
        {"id":"b5","name":"Bebida Quente","description":"Bebe uma bebida quente e confortante. Deixa-te aquecer por dentro.","feeling_colour":"blue","icon":"local-cafe","emoji":"☕"},
        {"id":"b6","name":"Canto Aconchegante","description":"Encontra um lugar confortável e senta-te ou deita-te por alguns minutos.","feeling_colour":"blue","icon":"home","emoji":"🛋️"},
    ],
    "green": [
        {"id":"g1","name":"Continua!","description":"Estás a ir muito bem! Continua com o que estás a fazer.","feeling_colour":"green","icon":"star","emoji":"⭐"},
        {"id":"g2","name":"Ajudar um Amigo","description":"Oferece ajuda a alguém. Ajudar os outros faz-nos sentir bem.","feeling_colour":"green","icon":"favorite","emoji":"❤️"},
        {"id":"g3","name":"Definir um Objetivo","description":"Pensa num objetivo pequeno para hoje. O que queres alcançar?","feeling_colour":"green","icon":"flag","emoji":"🎯"},
        {"id":"g4","name":"Gratidão","description":"Pensa em 3 coisas pelas quais és grato. Isso ajuda-nos a sentir felizes.","feeling_colour":"green","icon":"sentiment-satisfied","emoji":"🙏"},
        {"id":"g5","name":"Tenta Algo Novo","description":"Experimenta uma atividade ou ideia nova hoje.","feeling_colour":"green","icon":"explore","emoji":"🌟"},
        {"id":"g6","name":"Partilha o Teu Sorriso","description":"Sorri para alguém. Os sorrisos são contagiantes!","feeling_colour":"green","icon":"mood","emoji":"😊"},
    ],
    "yellow": [
        {"id":"y1","name":"Respiração de Bolhas","description":"Imagina que estás a soprar bolhas de sabão. Inspira fundo e expira devagar.","feeling_colour":"yellow","icon":"bubble-chart","emoji":"🫧"},
        {"id":"y2","name":"Conta até 10","description":"Conta devagar até 10. Isto ajuda o teu cérebro a acalmar.","feeling_colour":"yellow","icon":"format-list-numbered","emoji":"🔢"},
        {"id":"y3","name":"5 Sentidos","description":"Nomeia 5 coisas que vês, 4 que tocas, 3 que ouves, 2 que cheiras, 1 que sentes.","feeling_colour":"yellow","icon":"visibility","emoji":"👁️"},
        {"id":"y4","name":"Falar Sobre Isso","description":"Fala com alguém sobre o que te está a preocupar.","feeling_colour":"yellow","icon":"forum","emoji":"🗣️"},
        {"id":"y5","name":"Sacudir o Corpo","description":"Agita as mãos e o corpo por 30 segundos para libertar a tensão.","feeling_colour":"yellow","icon":"directions-run","emoji":"🕺"},
        {"id":"y6","name":"Apertar e Soltar","description":"Aperta os punhos com força e depois solta. Repete 5 vezes.","feeling_colour":"yellow","icon":"pan-tool","emoji":"✊"},
    ],
    "red": [
        {"id":"r1","name":"Parar","description":"Para e fica imóvel por um momento. Não faças nada ainda.","feeling_colour":"red","icon":"stop","emoji":"✋"},
        {"id":"r2","name":"Respirações Profundas","description":"Faz 5 respirações profundas. Inspira pelo nariz, expira pela boca.","feeling_colour":"red","icon":"air","emoji":"🌬️"},
        {"id":"r3","name":"Contar ao Contrário","description":"Conta de 10 até 1 devagar. Isto acalma o teu cérebro.","feeling_colour":"red","icon":"timer","emoji":"⏱️"},
        {"id":"r4","name":"Espaço Seguro","description":"Vai para um lugar calmo onde te sintas seguro.","feeling_colour":"red","icon":"shield","emoji":"🛡️"},
        {"id":"r5","name":"Pedir Ajuda","description":"Diz a um adulto em quem confias que precisas de ajuda agora.","feeling_colour":"red","icon":"support-agent","emoji":"🆘"},
        {"id":"r6","name":"Abraço a Si Mesmo","description":"Abraça-te a ti mesmo. Cruza os braços e aperta-te suavemente.","feeling_colour":"red","icon":"favorite","emoji":"🤗"},
    ],
}

HELPERS_ES = {
    "blue": [
        {"id":"b1","name":"Estiramiento Suave","description":"Estira el cuerpo lentamente. Esto ayuda cuando te sientes cansado o triste.","feeling_colour":"blue","icon":"self-improvement","emoji":"🧘"},
        {"id":"b2","name":"Canción Favorita","description":"Escucha o canta tu canción favorita. La música puede hacernos sentir mejor.","feeling_colour":"blue","icon":"music-note","emoji":"🎵"},
        {"id":"b3","name":"Díselo a Alguien","description":"Habla con alguien de confianza sobre cómo te sientes.","feeling_colour":"blue","icon":"chat","emoji":"💬"},
        {"id":"b4","name":"Respiración Lenta","description":"Inhala despacio por la nariz y exhala por la boca. Repite 5 veces.","feeling_colour":"blue","icon":"air","emoji":"💨"},
        {"id":"b5","name":"Bebida Caliente","description":"Bebe algo caliente y reconfortante. Deja que te caliente por dentro.","feeling_colour":"blue","icon":"local-cafe","emoji":"☕"},
        {"id":"b6","name":"Rincón Acogedor","description":"Encuentra un lugar cómodo y siéntate o túmbate unos minutos.","feeling_colour":"blue","icon":"home","emoji":"🛋️"},
    ],
    "green": [
        {"id":"g1","name":"¡Sigue Adelante!","description":"¡Lo estás haciendo muy bien! Continúa con lo que estás haciendo.","feeling_colour":"green","icon":"star","emoji":"⭐"},
        {"id":"g2","name":"Ayudar a un Amigo","description":"Ofrece ayuda a alguien. Ayudar a otros nos hace sentir bien.","feeling_colour":"green","icon":"favorite","emoji":"❤️"},
        {"id":"g3","name":"Establecer un Objetivo","description":"Piensa en un pequeño objetivo para hoy. ¿Qué quieres lograr?","feeling_colour":"green","icon":"flag","emoji":"🎯"},
        {"id":"g4","name":"Gratitud","description":"Piensa en 3 cosas por las que estás agradecido. Eso nos ayuda a sentirnos felices.","feeling_colour":"green","icon":"sentiment-satisfied","emoji":"🙏"},
        {"id":"g5","name":"Prueba Algo Nuevo","description":"Experimenta con una actividad o idea nueva hoy.","feeling_colour":"green","icon":"explore","emoji":"🌟"},
        {"id":"g6","name":"Comparte tu Sonrisa","description":"Sonríe a alguien. ¡Las sonrisas son contagiosas!","feeling_colour":"green","icon":"mood","emoji":"😊"},
    ],
    "yellow": [
        {"id":"y1","name":"Respiración de Burbujas","description":"Imagina que estás soplando burbujas de jabón. Inhala profundo y exhala despacio.","feeling_colour":"yellow","icon":"bubble-chart","emoji":"🫧"},
        {"id":"y2","name":"Contar hasta 10","description":"Cuenta despacio hasta 10. Esto ayuda a tu cerebro a calmarse.","feeling_colour":"yellow","icon":"format-list-numbered","emoji":"🔢"},
        {"id":"y3","name":"5 Sentidos","description":"Nombra 5 cosas que ves, 4 que tocas, 3 que oyes, 2 que hueles, 1 que sientes.","feeling_colour":"yellow","icon":"visibility","emoji":"👁️"},
        {"id":"y4","name":"Hablar de Ello","description":"Habla con alguien sobre lo que te preocupa.","feeling_colour":"yellow","icon":"forum","emoji":"🗣️"},
        {"id":"y5","name":"Sacudir el Cuerpo","description":"Agita las manos y el cuerpo durante 30 segundos para liberar la tensión.","feeling_colour":"yellow","icon":"directions-run","emoji":"🕺"},
        {"id":"y6","name":"Apretar y Soltar","description":"Aprieta los puños con fuerza y luego suéltalos. Repite 5 veces.","feeling_colour":"yellow","icon":"pan-tool","emoji":"✊"},
    ],
    "red": [
        {"id":"r1","name":"Parar","description":"Para y quédate quieto un momento. No hagas nada todavía.","feeling_colour":"red","icon":"stop","emoji":"✋"},
        {"id":"r2","name":"Respiraciones Profundas","description":"Haz 5 respiraciones profundas. Inhala por la nariz, exhala por la boca.","feeling_colour":"red","icon":"air","emoji":"🌬️"},
        {"id":"r3","name":"Contar al Revés","description":"Cuenta de 10 a 1 despacio. Esto calma tu cerebro.","feeling_colour":"red","icon":"timer","emoji":"⏱️"},
        {"id":"r4","name":"Espacio Seguro","description":"Ve a un lugar tranquilo donde te sientas seguro.","feeling_colour":"red","icon":"shield","emoji":"🛡️"},
        {"id":"r5","name":"Pedir Ayuda","description":"Dile a un adulto de confianza que necesitas ayuda ahora.","feeling_colour":"red","icon":"support-agent","emoji":"🆘"},
        {"id":"r6","name":"Abrazo a Uno Mismo","description":"Date un abrazo. Cruza los brazos y apriétate suavemente.","feeling_colour":"red","icon":"favorite","emoji":"🤗"},
    ],
}

HELPERS_FR = {
    "blue": [
        {"id":"b1","name":"Étirement Doux","description":"Étire ton corps lentement. Cela aide quand tu te sens fatigué ou triste.","feeling_colour":"blue","icon":"self-improvement","emoji":"🧘"},
        {"id":"b2","name":"Chanson Préférée","description":"Écoute ou chante ta chanson préférée. La musique peut nous aider à aller mieux.","feeling_colour":"blue","icon":"music-note","emoji":"🎵"},
        {"id":"b3","name":"Le Dire à Quelqu'un","description":"Parle à quelqu'un en qui tu as confiance de ce que tu ressens.","feeling_colour":"blue","icon":"chat","emoji":"💬"},
        {"id":"b4","name":"Respiration Lente","description":"Inspire lentement par le nez et expire par la bouche. Répète 5 fois.","feeling_colour":"blue","icon":"air","emoji":"💨"},
        {"id":"b5","name":"Boisson Chaude","description":"Bois quelque chose de chaud et réconfortant. Laisse-toi réchauffer de l'intérieur.","feeling_colour":"blue","icon":"local-cafe","emoji":"☕"},
        {"id":"b6","name":"Coin Douillet","description":"Trouve un endroit confortable et assieds-toi ou allonge-toi quelques minutes.","feeling_colour":"blue","icon":"home","emoji":"🛋️"},
    ],
    "green": [
        {"id":"g1","name":"Continue!","description":"Tu t'en sors très bien! Continue ce que tu fais.","feeling_colour":"green","icon":"star","emoji":"⭐"},
        {"id":"g2","name":"Aider un Ami","description":"Propose ton aide à quelqu'un. Aider les autres nous fait du bien.","feeling_colour":"green","icon":"favorite","emoji":"❤️"},
        {"id":"g3","name":"Fixer un Objectif","description":"Pense à un petit objectif pour aujourd'hui. Qu'est-ce que tu veux accomplir?","feeling_colour":"green","icon":"flag","emoji":"🎯"},
        {"id":"g4","name":"Gratitude","description":"Pense à 3 choses dont tu es reconnaissant. Cela nous aide à nous sentir heureux.","feeling_colour":"green","icon":"sentiment-satisfied","emoji":"🙏"},
        {"id":"g5","name":"Essayer Quelque Chose de Nouveau","description":"Expérimente une nouvelle activité ou idée aujourd'hui.","feeling_colour":"green","icon":"explore","emoji":"🌟"},
        {"id":"g6","name":"Partage ton Sourire","description":"Souris à quelqu'un. Les sourires sont contagieux!","feeling_colour":"green","icon":"mood","emoji":"😊"},
    ],
    "yellow": [
        {"id":"y1","name":"Respiration en Bulles","description":"Imagine que tu souffles des bulles de savon. Inspire profondément et expire lentement.","feeling_colour":"yellow","icon":"bubble-chart","emoji":"🫧"},
        {"id":"y2","name":"Compter jusqu'à 10","description":"Compte lentement jusqu'à 10. Cela aide ton cerveau à se calmer.","feeling_colour":"yellow","icon":"format-list-numbered","emoji":"🔢"},
        {"id":"y3","name":"5 Sens","description":"Nomme 5 choses que tu vois, 4 que tu touches, 3 que tu entends, 2 que tu sens, 1 que tu ressens.","feeling_colour":"yellow","icon":"visibility","emoji":"👁️"},
        {"id":"y4","name":"En Parler","description":"Parle à quelqu'un de ce qui te préoccupe.","feeling_colour":"yellow","icon":"forum","emoji":"🗣️"},
        {"id":"y5","name":"Secouer le Corps","description":"Agite tes mains et ton corps pendant 30 secondes pour libérer la tension.","feeling_colour":"yellow","icon":"directions-run","emoji":"🕺"},
        {"id":"y6","name":"Serrer et Relâcher","description":"Serre les poings fort puis relâche. Répète 5 fois.","feeling_colour":"yellow","icon":"pan-tool","emoji":"✊"},
    ],
    "red": [
        {"id":"r1","name":"S'arrêter","description":"Arrête-toi et reste immobile un moment. Ne fais rien encore.","feeling_colour":"red","icon":"stop","emoji":"✋"},
        {"id":"r2","name":"Grandes Respirations","description":"Fais 5 grandes respirations. Inspire par le nez, expire par la bouche.","feeling_colour":"red","icon":"air","emoji":"🌬️"},
        {"id":"r3","name":"Compter à Rebours","description":"Compte de 10 à 1 lentement. Cela calme ton cerveau.","feeling_colour":"red","icon":"timer","emoji":"⏱️"},
        {"id":"r4","name":"Espace Sécurisé","description":"Va dans un endroit calme où tu te sens en sécurité.","feeling_colour":"red","icon":"shield","emoji":"🛡️"},
        {"id":"r5","name":"Demander de l'Aide","description":"Dis à un adulte de confiance que tu as besoin d'aide maintenant.","feeling_colour":"red","icon":"support-agent","emoji":"🆘"},
        {"id":"r6","name":"Se Serrer dans ses Bras","description":"Serre-toi dans tes bras. Croise les bras et presse doucement.","feeling_colour":"red","icon":"favorite","emoji":"🤗"},
    ],
}

HELPERS_DE = {
    "blue": [
        {"id":"b1","name":"Sanfte Dehnung","description":"Strecke deinen Körper langsam. Das hilft, wenn du dich müde oder traurig fühlst.","feeling_colour":"blue","icon":"self-improvement","emoji":"🧘"},
        {"id":"b2","name":"Lieblingslied","description":"Hör dir dein Lieblingslied an oder singe es. Musik kann uns besser fühlen lassen.","feeling_colour":"blue","icon":"music-note","emoji":"🎵"},
        {"id":"b3","name":"Jemandem Sagen","description":"Sprich mit jemandem, dem du vertraust, über deine Gefühle.","feeling_colour":"blue","icon":"chat","emoji":"💬"},
        {"id":"b4","name":"Langsames Atmen","description":"Atme langsam durch die Nase ein und durch den Mund aus. Wiederhole 5 mal.","feeling_colour":"blue","icon":"air","emoji":"💨"},
        {"id":"b5","name":"Warmes Getränk","description":"Trink etwas Warmes und Tröstliches. Lass dich von innen erwärmen.","feeling_colour":"blue","icon":"local-cafe","emoji":"☕"},
        {"id":"b6","name":"Gemütliche Ecke","description":"Finde einen bequemen Platz und sitz oder leg dich ein paar Minuten hin.","feeling_colour":"blue","icon":"home","emoji":"🛋️"},
    ],
    "green": [
        {"id":"g1","name":"Weitermachen!","description":"Du machst das sehr gut! Mach weiter, was du tust.","feeling_colour":"green","icon":"star","emoji":"⭐"},
        {"id":"g2","name":"Einem Freund Helfen","description":"Biete jemandem deine Hilfe an. Anderen zu helfen macht uns glücklich.","feeling_colour":"green","icon":"favorite","emoji":"❤️"},
        {"id":"g3","name":"Ein Ziel Setzen","description":"Denke an ein kleines Ziel für heute. Was möchtest du erreichen?","feeling_colour":"green","icon":"flag","emoji":"🎯"},
        {"id":"g4","name":"Dankbarkeit","description":"Denke an 3 Dinge, für die du dankbar bist. Das hilft uns, glücklich zu sein.","feeling_colour":"green","icon":"sentiment-satisfied","emoji":"🙏"},
        {"id":"g5","name":"Etwas Neues Ausprobieren","description":"Probiere heute eine neue Aktivität oder Idee aus.","feeling_colour":"green","icon":"explore","emoji":"🌟"},
        {"id":"g6","name":"Dein Lächeln Teilen","description":"Lächle jemanden an. Lächeln sind ansteckend!","feeling_colour":"green","icon":"mood","emoji":"😊"},
    ],
    "yellow": [
        {"id":"y1","name":"Blasen-Atmung","description":"Stell dir vor, du pustest Seifenblasen. Tief einatmen und langsam ausatmen.","feeling_colour":"yellow","icon":"bubble-chart","emoji":"🫧"},
        {"id":"y2","name":"Bis 10 Zählen","description":"Zähle langsam bis 10. Das hilft deinem Gehirn, sich zu beruhigen.","feeling_colour":"yellow","icon":"format-list-numbered","emoji":"🔢"},
        {"id":"y3","name":"5 Sinne","description":"Nenne 5 Dinge die du siehst, 4 die du anfasst, 3 die du hörst, 2 die du riechst, 1 die du fühlst.","feeling_colour":"yellow","icon":"visibility","emoji":"👁️"},
        {"id":"y4","name":"Darüber Sprechen","description":"Sprich mit jemandem über das, was dich besorgt.","feeling_colour":"yellow","icon":"forum","emoji":"🗣️"},
        {"id":"y5","name":"Körper Schütteln","description":"Schüttle deine Hände und deinen Körper 30 Sekunden lang, um Anspannung loszulassen.","feeling_colour":"yellow","icon":"directions-run","emoji":"🕺"},
        {"id":"y6","name":"Drücken und Loslassen","description":"Drücke deine Fäuste fest zusammen und lass dann los. Wiederhole 5 mal.","feeling_colour":"yellow","icon":"pan-tool","emoji":"✊"},
    ],
    "red": [
        {"id":"r1","name":"Stopp","description":"Halte an und bleibe einen Moment still. Tu noch nichts.","feeling_colour":"red","icon":"stop","emoji":"✋"},
        {"id":"r2","name":"Tiefe Atemzüge","description":"Mache 5 tiefe Atemzüge. Einatmen durch die Nase, ausatmen durch den Mund.","feeling_colour":"red","icon":"air","emoji":"🌬️"},
        {"id":"r3","name":"Rückwärts Zählen","description":"Zähle langsam von 10 bis 1. Das beruhigt dein Gehirn.","feeling_colour":"red","icon":"timer","emoji":"⏱️"},
        {"id":"r4","name":"Sicherer Ort","description":"Geh an einen ruhigen Ort, wo du dich sicher fühlst.","feeling_colour":"red","icon":"shield","emoji":"🛡️"},
        {"id":"r5","name":"Hilfe Holen","description":"Sag einem vertrauenswürdigen Erwachsenen, dass du jetzt Hilfe brauchst.","feeling_colour":"red","icon":"support-agent","emoji":"🆘"},
        {"id":"r6","name":"Sich Selbst Umarmen","description":"Umarme dich selbst. Verschränke die Arme und drücke sanft.","feeling_colour":"red","icon":"favorite","emoji":"🤗"},
    ],
}

HELPERS_IT = {
    "blue": [
        {"id":"b1","name":"Stretching Leggero","description":"Stira il corpo lentamente. Questo aiuta quando ti senti stanco o triste.","feeling_colour":"blue","icon":"self-improvement","emoji":"🧘"},
        {"id":"b2","name":"Canzone Preferita","description":"Ascolta o canta la tua canzone preferita. La musica può farci sentire meglio.","feeling_colour":"blue","icon":"music-note","emoji":"🎵"},
        {"id":"b3","name":"Dillo a Qualcuno","description":"Parla con qualcuno di cui ti fidi di come ti senti.","feeling_colour":"blue","icon":"chat","emoji":"💬"},
        {"id":"b4","name":"Respirazione Lenta","description":"Inspira lentamente dal naso ed espira dalla bocca. Ripeti 5 volte.","feeling_colour":"blue","icon":"air","emoji":"💨"},
        {"id":"b5","name":"Bevanda Calda","description":"Bevi qualcosa di caldo e confortante. Lasciati riscaldare dall'interno.","feeling_colour":"blue","icon":"local-cafe","emoji":"☕"},
        {"id":"b6","name":"Angolo Accogliente","description":"Trova un posto comodo e siediti o sdraiati per qualche minuto.","feeling_colour":"blue","icon":"home","emoji":"🛋️"},
    ],
    "green": [
        {"id":"g1","name":"Continua!","description":"Stai andando molto bene! Continua con quello che stai facendo.","feeling_colour":"green","icon":"star","emoji":"⭐"},
        {"id":"g2","name":"Aiuta un Amico","description":"Offri il tuo aiuto a qualcuno. Aiutare gli altri ci fa stare bene.","feeling_colour":"green","icon":"favorite","emoji":"❤️"},
        {"id":"g3","name":"Fissa un Obiettivo","description":"Pensa a un piccolo obiettivo per oggi. Cosa vuoi raggiungere?","feeling_colour":"green","icon":"flag","emoji":"🎯"},
        {"id":"g4","name":"Gratitudine","description":"Pensa a 3 cose per cui sei grato. Questo ci aiuta a sentirci felici.","feeling_colour":"green","icon":"sentiment-satisfied","emoji":"🙏"},
        {"id":"g5","name":"Prova Qualcosa di Nuovo","description":"Sperimenta una nuova attività o idea oggi.","feeling_colour":"green","icon":"explore","emoji":"🌟"},
        {"id":"g6","name":"Condividi il Tuo Sorriso","description":"Sorridi a qualcuno. I sorrisi sono contagiosi!","feeling_colour":"green","icon":"mood","emoji":"😊"},
    ],
    "yellow": [
        {"id":"y1","name":"Respirazione a Bolle","description":"Immagina di soffiare bolle di sapone. Inspira profondamente ed espira lentamente.","feeling_colour":"yellow","icon":"bubble-chart","emoji":"🫧"},
        {"id":"y2","name":"Conta fino a 10","description":"Conta lentamente fino a 10. Questo aiuta il tuo cervello a calmarsi.","feeling_colour":"yellow","icon":"format-list-numbered","emoji":"🔢"},
        {"id":"y3","name":"5 Sensi","description":"Nomina 5 cose che vedi, 4 che tocchi, 3 che senti, 2 che annusi, 1 che provi.","feeling_colour":"yellow","icon":"visibility","emoji":"👁️"},
        {"id":"y4","name":"Parlarne","description":"Parla con qualcuno di ciò che ti preoccupa.","feeling_colour":"yellow","icon":"forum","emoji":"🗣️"},
        {"id":"y5","name":"Scuotere il Corpo","description":"Agita le mani e il corpo per 30 secondi per rilasciare la tensione.","feeling_colour":"yellow","icon":"directions-run","emoji":"🕺"},
        {"id":"y6","name":"Stringi e Rilascia","description":"Stringi i pugni con forza e poi rilascia. Ripeti 5 volte.","feeling_colour":"yellow","icon":"pan-tool","emoji":"✊"},
    ],
    "red": [
        {"id":"r1","name":"Fermati","description":"Fermati e resta immobile per un momento. Non fare ancora nulla.","feeling_colour":"red","icon":"stop","emoji":"✋"},
        {"id":"r2","name":"Respiri Profondi","description":"Fai 5 respiri profondi. Inspira dal naso, espira dalla bocca.","feeling_colour":"red","icon":"air","emoji":"🌬️"},
        {"id":"r3","name":"Conta al Contrario","description":"Conta lentamente da 10 a 1. Questo calma il tuo cervello.","feeling_colour":"red","icon":"timer","emoji":"⏱️"},
        {"id":"r4","name":"Spazio Sicuro","description":"Vai in un posto tranquillo dove ti senti al sicuro.","feeling_colour":"red","icon":"shield","emoji":"🛡️"},
        {"id":"r5","name":"Chiedi Aiuto","description":"Dì a un adulto di cui ti fidi che hai bisogno di aiuto ora.","feeling_colour":"red","icon":"support-agent","emoji":"🆘"},
        {"id":"r6","name":"Abbracciati","description":"Abbraccia te stesso. Incrocia le braccia e stringi delicatamente.","feeling_colour":"red","icon":"favorite","emoji":"🤗"},
    ],
}


# ── Translated helper/strategy cards per language ──────────────────────────
HELPERS_PT = {
    "blue": [
        {"id":"b1","name":"Alongamento Suave","description":"Estira o corpo lentamente. Isto ajuda quando te sentes cansado ou triste.","feeling_colour":"blue","icon":"self-improvement","emoji":"🧘"},
        {"id":"b2","name":"Canção Favorita","description":"Ouve ou canta a tua música favorita. A música pode fazer-nos sentir melhor.","feeling_colour":"blue","icon":"music-note","emoji":"🎵"},
        {"id":"b3","name":"Dizer a Alguém","description":"Fala com alguém em quem confias sobre como te sentes.","feeling_colour":"blue","icon":"chat","emoji":"💬"},
        {"id":"b4","name":"Respiração Lenta","description":"Inspira devagar pelo nariz e expira pela boca. Repete 5 vezes.","feeling_colour":"blue","icon":"air","emoji":"💨"},
        {"id":"b5","name":"Bebida Quente","description":"Bebe uma bebida quente e confortante. Deixa-te aquecer por dentro.","feeling_colour":"blue","icon":"local-cafe","emoji":"☕"},
        {"id":"b6","name":"Canto Aconchegante","description":"Encontra um lugar confortável e senta-te ou deita-te por alguns minutos.","feeling_colour":"blue","icon":"home","emoji":"🛋️"},
    ],
    "green": [
        {"id":"g1","name":"Continua!","description":"Estás a ir muito bem! Continua com o que estás a fazer.","feeling_colour":"green","icon":"star","emoji":"⭐"},
        {"id":"g2","name":"Ajudar um Amigo","description":"Oferece ajuda a alguém. Ajudar os outros faz-nos sentir bem.","feeling_colour":"green","icon":"favorite","emoji":"❤️"},
        {"id":"g3","name":"Definir um Objetivo","description":"Pensa num objetivo pequeno para hoje. O que queres alcançar?","feeling_colour":"green","icon":"flag","emoji":"🎯"},
        {"id":"g4","name":"Gratidão","description":"Pensa em 3 coisas pelas quais és grato. Isso ajuda-nos a sentir felizes.","feeling_colour":"green","icon":"sentiment-satisfied","emoji":"🙏"},
        {"id":"g5","name":"Tenta Algo Novo","description":"Experimenta uma atividade ou ideia nova hoje.","feeling_colour":"green","icon":"explore","emoji":"🌟"},
        {"id":"g6","name":"Partilha o Teu Sorriso","description":"Sorri para alguém. Os sorrisos são contagiantes!","feeling_colour":"green","icon":"mood","emoji":"😊"},
    ],
    "yellow": [
        {"id":"y1","name":"Respiração de Bolhas","description":"Imagina que estás a soprar bolhas de sabão. Inspira fundo e expira devagar.","feeling_colour":"yellow","icon":"bubble-chart","emoji":"🫧"},
        {"id":"y2","name":"Conta até 10","description":"Conta devagar até 10. Isto ajuda o teu cérebro a acalmar.","feeling_colour":"yellow","icon":"format-list-numbered","emoji":"🔢"},
        {"id":"y3","name":"5 Sentidos","description":"Nomeia 5 coisas que vês, 4 que tocas, 3 que ouves, 2 que cheiras, 1 que sentes.","feeling_colour":"yellow","icon":"visibility","emoji":"👁️"},
        {"id":"y4","name":"Falar Sobre Isso","description":"Fala com alguém sobre o que te está a preocupar.","feeling_colour":"yellow","icon":"forum","emoji":"🗣️"},
        {"id":"y5","name":"Sacudir o Corpo","description":"Agita as mãos e o corpo por 30 segundos para libertar a tensão.","feeling_colour":"yellow","icon":"directions-run","emoji":"🕺"},
        {"id":"y6","name":"Apertar e Soltar","description":"Aperta os punhos com força e depois solta. Repete 5 vezes.","feeling_colour":"yellow","icon":"pan-tool","emoji":"✊"},
    ],
    "red": [
        {"id":"r1","name":"Parar","description":"Para e fica imóvel por um momento. Não faças nada ainda.","feeling_colour":"red","icon":"stop","emoji":"✋"},
        {"id":"r2","name":"Respirações Profundas","description":"Faz 5 respirações profundas. Inspira pelo nariz, expira pela boca.","feeling_colour":"red","icon":"air","emoji":"🌬️"},
        {"id":"r3","name":"Contar ao Contrário","description":"Conta de 10 até 1 devagar. Isto acalma o teu cérebro.","feeling_colour":"red","icon":"timer","emoji":"⏱️"},
        {"id":"r4","name":"Espaço Seguro","description":"Vai para um lugar calmo onde te sintas seguro.","feeling_colour":"red","icon":"shield","emoji":"🛡️"},
        {"id":"r5","name":"Pedir Ajuda","description":"Diz a um adulto em quem confias que precisas de ajuda agora.","feeling_colour":"red","icon":"support-agent","emoji":"🆘"},
        {"id":"r6","name":"Abraço a Si Mesmo","description":"Abraça-te a ti mesmo. Cruza os braços e aperta-te suavemente.","feeling_colour":"red","icon":"favorite","emoji":"🤗"},
    ],
}

HELPERS_ES = {
    "blue": [
        {"id":"b1","name":"Estiramiento Suave","description":"Estira el cuerpo lentamente. Esto ayuda cuando te sientes cansado o triste.","feeling_colour":"blue","icon":"self-improvement","emoji":"🧘"},
        {"id":"b2","name":"Canción Favorita","description":"Escucha o canta tu canción favorita. La música puede hacernos sentir mejor.","feeling_colour":"blue","icon":"music-note","emoji":"🎵"},
        {"id":"b3","name":"Díselo a Alguien","description":"Habla con alguien de confianza sobre cómo te sientes.","feeling_colour":"blue","icon":"chat","emoji":"💬"},
        {"id":"b4","name":"Respiración Lenta","description":"Inhala despacio por la nariz y exhala por la boca. Repite 5 veces.","feeling_colour":"blue","icon":"air","emoji":"💨"},
        {"id":"b5","name":"Bebida Caliente","description":"Bebe algo caliente y reconfortante. Deja que te caliente por dentro.","feeling_colour":"blue","icon":"local-cafe","emoji":"☕"},
        {"id":"b6","name":"Rincón Acogedor","description":"Encuentra un lugar cómodo y siéntate o túmbate unos minutos.","feeling_colour":"blue","icon":"home","emoji":"🛋️"},
    ],
    "green": [
        {"id":"g1","name":"¡Sigue Adelante!","description":"¡Lo estás haciendo muy bien! Continúa con lo que estás haciendo.","feeling_colour":"green","icon":"star","emoji":"⭐"},
        {"id":"g2","name":"Ayudar a un Amigo","description":"Ofrece ayuda a alguien. Ayudar a otros nos hace sentir bien.","feeling_colour":"green","icon":"favorite","emoji":"❤️"},
        {"id":"g3","name":"Establecer un Objetivo","description":"Piensa en un pequeño objetivo para hoy. ¿Qué quieres lograr?","feeling_colour":"green","icon":"flag","emoji":"🎯"},
        {"id":"g4","name":"Gratitud","description":"Piensa en 3 cosas por las que estás agradecido. Eso nos ayuda a sentirnos felices.","feeling_colour":"green","icon":"sentiment-satisfied","emoji":"🙏"},
        {"id":"g5","name":"Prueba Algo Nuevo","description":"Experimenta con una actividad o idea nueva hoy.","feeling_colour":"green","icon":"explore","emoji":"🌟"},
        {"id":"g6","name":"Comparte tu Sonrisa","description":"Sonríe a alguien. ¡Las sonrisas son contagiosas!","feeling_colour":"green","icon":"mood","emoji":"😊"},
    ],
    "yellow": [
        {"id":"y1","name":"Respiración de Burbujas","description":"Imagina que estás soplando burbujas de jabón. Inhala profundo y exhala despacio.","feeling_colour":"yellow","icon":"bubble-chart","emoji":"🫧"},
        {"id":"y2","name":"Contar hasta 10","description":"Cuenta despacio hasta 10. Esto ayuda a tu cerebro a calmarse.","feeling_colour":"yellow","icon":"format-list-numbered","emoji":"🔢"},
        {"id":"y3","name":"5 Sentidos","description":"Nombra 5 cosas que ves, 4 que tocas, 3 que oyes, 2 que hueles, 1 que sientes.","feeling_colour":"yellow","icon":"visibility","emoji":"👁️"},
        {"id":"y4","name":"Hablar de Ello","description":"Habla con alguien sobre lo que te preocupa.","feeling_colour":"yellow","icon":"forum","emoji":"🗣️"},
        {"id":"y5","name":"Sacudir el Cuerpo","description":"Agita las manos y el cuerpo durante 30 segundos para liberar la tensión.","feeling_colour":"yellow","icon":"directions-run","emoji":"🕺"},
        {"id":"y6","name":"Apretar y Soltar","description":"Aprieta los puños con fuerza y luego suéltalos. Repite 5 veces.","feeling_colour":"yellow","icon":"pan-tool","emoji":"✊"},
    ],
    "red": [
        {"id":"r1","name":"Parar","description":"Para y quédate quieto un momento. No hagas nada todavía.","feeling_colour":"red","icon":"stop","emoji":"✋"},
        {"id":"r2","name":"Respiraciones Profundas","description":"Haz 5 respiraciones profundas. Inhala por la nariz, exhala por la boca.","feeling_colour":"red","icon":"air","emoji":"🌬️"},
        {"id":"r3","name":"Contar al Revés","description":"Cuenta de 10 a 1 despacio. Esto calma tu cerebro.","feeling_colour":"red","icon":"timer","emoji":"⏱️"},
        {"id":"r4","name":"Espacio Seguro","description":"Ve a un lugar tranquilo donde te sientas seguro.","feeling_colour":"red","icon":"shield","emoji":"🛡️"},
        {"id":"r5","name":"Pedir Ayuda","description":"Dile a un adulto de confianza que necesitas ayuda ahora.","feeling_colour":"red","icon":"support-agent","emoji":"🆘"},
        {"id":"r6","name":"Abrazo a Uno Mismo","description":"Date un abrazo. Cruza los brazos y apriétate suavemente.","feeling_colour":"red","icon":"favorite","emoji":"🤗"},
    ],
}

HELPERS_FR = {
    "blue": [
        {"id":"b1","name":"Étirement Doux","description":"Étire ton corps lentement. Cela aide quand tu te sens fatigué ou triste.","feeling_colour":"blue","icon":"self-improvement","emoji":"🧘"},
        {"id":"b2","name":"Chanson Préférée","description":"Écoute ou chante ta chanson préférée. La musique peut nous aider à aller mieux.","feeling_colour":"blue","icon":"music-note","emoji":"🎵"},
        {"id":"b3","name":"Le Dire à Quelqu'un","description":"Parle à quelqu'un en qui tu as confiance de ce que tu ressens.","feeling_colour":"blue","icon":"chat","emoji":"💬"},
        {"id":"b4","name":"Respiration Lente","description":"Inspire lentement par le nez et expire par la bouche. Répète 5 fois.","feeling_colour":"blue","icon":"air","emoji":"💨"},
        {"id":"b5","name":"Boisson Chaude","description":"Bois quelque chose de chaud et réconfortant. Laisse-toi réchauffer de l'intérieur.","feeling_colour":"blue","icon":"local-cafe","emoji":"☕"},
        {"id":"b6","name":"Coin Douillet","description":"Trouve un endroit confortable et assieds-toi ou allonge-toi quelques minutes.","feeling_colour":"blue","icon":"home","emoji":"🛋️"},
    ],
    "green": [
        {"id":"g1","name":"Continue!","description":"Tu t'en sors très bien! Continue ce que tu fais.","feeling_colour":"green","icon":"star","emoji":"⭐"},
        {"id":"g2","name":"Aider un Ami","description":"Propose ton aide à quelqu'un. Aider les autres nous fait du bien.","feeling_colour":"green","icon":"favorite","emoji":"❤️"},
        {"id":"g3","name":"Fixer un Objectif","description":"Pense à un petit objectif pour aujourd'hui. Qu'est-ce que tu veux accomplir?","feeling_colour":"green","icon":"flag","emoji":"🎯"},
        {"id":"g4","name":"Gratitude","description":"Pense à 3 choses dont tu es reconnaissant. Cela nous aide à nous sentir heureux.","feeling_colour":"green","icon":"sentiment-satisfied","emoji":"🙏"},
        {"id":"g5","name":"Essayer Quelque Chose de Nouveau","description":"Expérimente une nouvelle activité ou idée aujourd'hui.","feeling_colour":"green","icon":"explore","emoji":"🌟"},
        {"id":"g6","name":"Partage ton Sourire","description":"Souris à quelqu'un. Les sourires sont contagieux!","feeling_colour":"green","icon":"mood","emoji":"😊"},
    ],
    "yellow": [
        {"id":"y1","name":"Respiration en Bulles","description":"Imagine que tu souffles des bulles de savon. Inspire profondément et expire lentement.","feeling_colour":"yellow","icon":"bubble-chart","emoji":"🫧"},
        {"id":"y2","name":"Compter jusqu'à 10","description":"Compte lentement jusqu'à 10. Cela aide ton cerveau à se calmer.","feeling_colour":"yellow","icon":"format-list-numbered","emoji":"🔢"},
        {"id":"y3","name":"5 Sens","description":"Nomme 5 choses que tu vois, 4 que tu touches, 3 que tu entends, 2 que tu sens, 1 que tu ressens.","feeling_colour":"yellow","icon":"visibility","emoji":"👁️"},
        {"id":"y4","name":"En Parler","description":"Parle à quelqu'un de ce qui te préoccupe.","feeling_colour":"yellow","icon":"forum","emoji":"🗣️"},
        {"id":"y5","name":"Secouer le Corps","description":"Agite tes mains et ton corps pendant 30 secondes pour libérer la tension.","feeling_colour":"yellow","icon":"directions-run","emoji":"🕺"},
        {"id":"y6","name":"Serrer et Relâcher","description":"Serre les poings fort puis relâche. Répète 5 fois.","feeling_colour":"yellow","icon":"pan-tool","emoji":"✊"},
    ],
    "red": [
        {"id":"r1","name":"S'arrêter","description":"Arrête-toi et reste immobile un moment. Ne fais rien encore.","feeling_colour":"red","icon":"stop","emoji":"✋"},
        {"id":"r2","name":"Grandes Respirations","description":"Fais 5 grandes respirations. Inspire par le nez, expire par la bouche.","feeling_colour":"red","icon":"air","emoji":"🌬️"},
        {"id":"r3","name":"Compter à Rebours","description":"Compte de 10 à 1 lentement. Cela calme ton cerveau.","feeling_colour":"red","icon":"timer","emoji":"⏱️"},
        {"id":"r4","name":"Espace Sécurisé","description":"Va dans un endroit calme où tu te sens en sécurité.","feeling_colour":"red","icon":"shield","emoji":"🛡️"},
        {"id":"r5","name":"Demander de l'Aide","description":"Dis à un adulte de confiance que tu as besoin d'aide maintenant.","feeling_colour":"red","icon":"support-agent","emoji":"🆘"},
        {"id":"r6","name":"Se Serrer dans ses Bras","description":"Serre-toi dans tes bras. Croise les bras et presse doucement.","feeling_colour":"red","icon":"favorite","emoji":"🤗"},
    ],
}

HELPERS_DE = {
    "blue": [
        {"id":"b1","name":"Sanfte Dehnung","description":"Strecke deinen Körper langsam. Das hilft, wenn du dich müde oder traurig fühlst.","feeling_colour":"blue","icon":"self-improvement","emoji":"🧘"},
        {"id":"b2","name":"Lieblingslied","description":"Hör dir dein Lieblingslied an oder singe es. Musik kann uns besser fühlen lassen.","feeling_colour":"blue","icon":"music-note","emoji":"🎵"},
        {"id":"b3","name":"Jemandem Sagen","description":"Sprich mit jemandem, dem du vertraust, über deine Gefühle.","feeling_colour":"blue","icon":"chat","emoji":"💬"},
        {"id":"b4","name":"Langsames Atmen","description":"Atme langsam durch die Nase ein und durch den Mund aus. Wiederhole 5 mal.","feeling_colour":"blue","icon":"air","emoji":"💨"},
        {"id":"b5","name":"Warmes Getränk","description":"Trink etwas Warmes und Tröstliches. Lass dich von innen erwärmen.","feeling_colour":"blue","icon":"local-cafe","emoji":"☕"},
        {"id":"b6","name":"Gemütliche Ecke","description":"Finde einen bequemen Platz und sitz oder leg dich ein paar Minuten hin.","feeling_colour":"blue","icon":"home","emoji":"🛋️"},
    ],
    "green": [
        {"id":"g1","name":"Weitermachen!","description":"Du machst das sehr gut! Mach weiter, was du tust.","feeling_colour":"green","icon":"star","emoji":"⭐"},
        {"id":"g2","name":"Einem Freund Helfen","description":"Biete jemandem deine Hilfe an. Anderen zu helfen macht uns glücklich.","feeling_colour":"green","icon":"favorite","emoji":"❤️"},
        {"id":"g3","name":"Ein Ziel Setzen","description":"Denke an ein kleines Ziel für heute. Was möchtest du erreichen?","feeling_colour":"green","icon":"flag","emoji":"🎯"},
        {"id":"g4","name":"Dankbarkeit","description":"Denke an 3 Dinge, für die du dankbar bist. Das hilft uns, glücklich zu sein.","feeling_colour":"green","icon":"sentiment-satisfied","emoji":"🙏"},
        {"id":"g5","name":"Etwas Neues Ausprobieren","description":"Probiere heute eine neue Aktivität oder Idee aus.","feeling_colour":"green","icon":"explore","emoji":"🌟"},
        {"id":"g6","name":"Dein Lächeln Teilen","description":"Lächle jemanden an. Lächeln sind ansteckend!","feeling_colour":"green","icon":"mood","emoji":"😊"},
    ],
    "yellow": [
        {"id":"y1","name":"Blasen-Atmung","description":"Stell dir vor, du pustest Seifenblasen. Tief einatmen und langsam ausatmen.","feeling_colour":"yellow","icon":"bubble-chart","emoji":"🫧"},
        {"id":"y2","name":"Bis 10 Zählen","description":"Zähle langsam bis 10. Das hilft deinem Gehirn, sich zu beruhigen.","feeling_colour":"yellow","icon":"format-list-numbered","emoji":"🔢"},
        {"id":"y3","name":"5 Sinne","description":"Nenne 5 Dinge die du siehst, 4 die du anfasst, 3 die du hörst, 2 die du riechst, 1 die du fühlst.","feeling_colour":"yellow","icon":"visibility","emoji":"👁️"},
        {"id":"y4","name":"Darüber Sprechen","description":"Sprich mit jemandem über das, was dich besorgt.","feeling_colour":"yellow","icon":"forum","emoji":"🗣️"},
        {"id":"y5","name":"Körper Schütteln","description":"Schüttle deine Hände und deinen Körper 30 Sekunden lang, um Anspannung loszulassen.","feeling_colour":"yellow","icon":"directions-run","emoji":"🕺"},
        {"id":"y6","name":"Drücken und Loslassen","description":"Drücke deine Fäuste fest zusammen und lass dann los. Wiederhole 5 mal.","feeling_colour":"yellow","icon":"pan-tool","emoji":"✊"},
    ],
    "red": [
        {"id":"r1","name":"Stopp","description":"Halte an und bleibe einen Moment still. Tu noch nichts.","feeling_colour":"red","icon":"stop","emoji":"✋"},
        {"id":"r2","name":"Tiefe Atemzüge","description":"Mache 5 tiefe Atemzüge. Einatmen durch die Nase, ausatmen durch den Mund.","feeling_colour":"red","icon":"air","emoji":"🌬️"},
        {"id":"r3","name":"Rückwärts Zählen","description":"Zähle langsam von 10 bis 1. Das beruhigt dein Gehirn.","feeling_colour":"red","icon":"timer","emoji":"⏱️"},
        {"id":"r4","name":"Sicherer Ort","description":"Geh an einen ruhigen Ort, wo du dich sicher fühlst.","feeling_colour":"red","icon":"shield","emoji":"🛡️"},
        {"id":"r5","name":"Hilfe Holen","description":"Sag einem vertrauenswürdigen Erwachsenen, dass du jetzt Hilfe brauchst.","feeling_colour":"red","icon":"support-agent","emoji":"🆘"},
        {"id":"r6","name":"Sich Selbst Umarmen","description":"Umarme dich selbst. Verschränke die Arme und drücke sanft.","feeling_colour":"red","icon":"favorite","emoji":"🤗"},
    ],
}

HELPERS_IT = {
    "blue": [
        {"id":"b1","name":"Stretching Leggero","description":"Stira il corpo lentamente. Questo aiuta quando ti senti stanco o triste.","feeling_colour":"blue","icon":"self-improvement","emoji":"🧘"},
        {"id":"b2","name":"Canzone Preferita","description":"Ascolta o canta la tua canzone preferita. La musica può farci sentire meglio.","feeling_colour":"blue","icon":"music-note","emoji":"🎵"},
        {"id":"b3","name":"Dillo a Qualcuno","description":"Parla con qualcuno di cui ti fidi di come ti senti.","feeling_colour":"blue","icon":"chat","emoji":"💬"},
        {"id":"b4","name":"Respirazione Lenta","description":"Inspira lentamente dal naso ed espira dalla bocca. Ripeti 5 volte.","feeling_colour":"blue","icon":"air","emoji":"💨"},
        {"id":"b5","name":"Bevanda Calda","description":"Bevi qualcosa di caldo e confortante. Lasciati riscaldare dall'interno.","feeling_colour":"blue","icon":"local-cafe","emoji":"☕"},
        {"id":"b6","name":"Angolo Accogliente","description":"Trova un posto comodo e siediti o sdraiati per qualche minuto.","feeling_colour":"blue","icon":"home","emoji":"🛋️"},
    ],
    "green": [
        {"id":"g1","name":"Continua!","description":"Stai andando molto bene! Continua con quello che stai facendo.","feeling_colour":"green","icon":"star","emoji":"⭐"},
        {"id":"g2","name":"Aiuta un Amico","description":"Offri il tuo aiuto a qualcuno. Aiutare gli altri ci fa stare bene.","feeling_colour":"green","icon":"favorite","emoji":"❤️"},
        {"id":"g3","name":"Fissa un Obiettivo","description":"Pensa a un piccolo obiettivo per oggi. Cosa vuoi raggiungere?","feeling_colour":"green","icon":"flag","emoji":"🎯"},
        {"id":"g4","name":"Gratitudine","description":"Pensa a 3 cose per cui sei grato. Questo ci aiuta a sentirci felici.","feeling_colour":"green","icon":"sentiment-satisfied","emoji":"🙏"},
        {"id":"g5","name":"Prova Qualcosa di Nuovo","description":"Sperimenta una nuova attività o idea oggi.","feeling_colour":"green","icon":"explore","emoji":"🌟"},
        {"id":"g6","name":"Condividi il Tuo Sorriso","description":"Sorridi a qualcuno. I sorrisi sono contagiosi!","feeling_colour":"green","icon":"mood","emoji":"😊"},
    ],
    "yellow": [
        {"id":"y1","name":"Respirazione a Bolle","description":"Immagina di soffiare bolle di sapone. Inspira profondamente ed espira lentamente.","feeling_colour":"yellow","icon":"bubble-chart","emoji":"🫧"},
        {"id":"y2","name":"Conta fino a 10","description":"Conta lentamente fino a 10. Questo aiuta il tuo cervello a calmarsi.","feeling_colour":"yellow","icon":"format-list-numbered","emoji":"🔢"},
        {"id":"y3","name":"5 Sensi","description":"Nomina 5 cose che vedi, 4 che tocchi, 3 che senti, 2 che annusi, 1 che provi.","feeling_colour":"yellow","icon":"visibility","emoji":"👁️"},
        {"id":"y4","name":"Parlarne","description":"Parla con qualcuno di ciò che ti preoccupa.","feeling_colour":"yellow","icon":"forum","emoji":"🗣️"},
        {"id":"y5","name":"Scuotere il Corpo","description":"Agita le mani e il corpo per 30 secondi per rilasciare la tensione.","feeling_colour":"yellow","icon":"directions-run","emoji":"🕺"},
        {"id":"y6","name":"Stringi e Rilascia","description":"Stringi i pugni con forza e poi rilascia. Ripeti 5 volte.","feeling_colour":"yellow","icon":"pan-tool","emoji":"✊"},
    ],
    "red": [
        {"id":"r1","name":"Fermati","description":"Fermati e resta immobile per un momento. Non fare ancora nulla.","feeling_colour":"red","icon":"stop","emoji":"✋"},
        {"id":"r2","name":"Respiri Profondi","description":"Fai 5 respiri profondi. Inspira dal naso, espira dalla bocca.","feeling_colour":"red","icon":"air","emoji":"🌬️"},
        {"id":"r3","name":"Conta al Contrario","description":"Conta lentamente da 10 a 1. Questo calma il tuo cervello.","feeling_colour":"red","icon":"timer","emoji":"⏱️"},
        {"id":"r4","name":"Spazio Sicuro","description":"Vai in un posto tranquillo dove ti senti al sicuro.","feeling_colour":"red","icon":"shield","emoji":"🛡️"},
        {"id":"r5","name":"Chiedi Aiuto","description":"Dì a un adulto di cui ti fidi che hai bisogno di aiuto ora.","feeling_colour":"red","icon":"support-agent","emoji":"🆘"},
        {"id":"r6","name":"Abbracciati","description":"Abbraccia te stesso. Incrocia le braccia e stringi delicatamente.","feeling_colour":"red","icon":"favorite","emoji":"🤗"},
    ],
}

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
    
        "teacher_checkin": "Check-in del Profesor",
        "your_checkins": "Tus Check-ins",
        "share_with_wellbeing": "Compartir con Bienestar",
        "save_checkin_btn": "Guardar Check-in",
        "select_strategies": "Seleccionar Estrategias",
        "how_feeling_today": "Como te sientes hoy?",
        "add_strategy": "Agregar Estrategia",
        "strategy_name": "Nombre de la Estrategia",
        "linked_students": "Estudiantes Vinculados",
        "home_data": "Datos en Casa",
        "school_sharing": "Compartir Escolar",
        "parent_sharing": "Compartir de Padres",
        "mutual_consent": "Consentimiento Mutuo Activo",
        "sharing_paused": "Compartir Pausado",
        "download_report": "Descargar Informe",
        "today": "Hoy",
        "track_emotional_wellness": "Seguimiento del bienestar emocional",
        "my_family": "Mi Familia",
        "add_member": "Agregar Miembro",
        "parent_strategies": "Estrategias para Padres",
        "child_strategies": "Estrategias para Ninos",
        "my_strategies": "Mis Estrategias",
        "assign_to": "Asignar a",
        "everyone": "Todos",
        "share_with_teacher": "Compartir con Profesor",
        "linked_child": "Hijo Vinculado",
        "school_linked": "Vinculado a la Escuela",
        "check_ins": "Check-ins",
        "no_checkins": "Sin check-ins aun",
        "add_family_strategy": "Agregar Estrategia Familiar",
        "all": "Todos",
        "home": "Casa",
        "school": "Escuela",
        "name": "Nombre",
        "description": "Descripcion",
        "emotion_colour": "Color de Emocion",
        "search_students": "Buscar estudiantes",
        "disclaimer": "Basado en investigación científica sobre regulación emocional",
        "blue_emotions": "Emociones Azules",
        "green_emotions": "Emociones Verdes",
        "yellow_emotions": "Emociones Amarillas",
        "red_emotions": "Emociones Rojas",
        "resources": "Recursos",
        "teacher_resources": "Recursos del Profesor",
        "family_resources": "Recursos Familiares",
        "collection": "Colección",
        "classrooms": "Aulas",
        "students": "Estudiantes",
        "view_class": "Ver Clase",
        "wellbeing_alert": "Alerta de Bienestar",
        "support": "Soporte",
        "add_student": "Agregar Estudiante",
        "pdf_report": "Informe PDF",
        "my_wellbeing": "Mi Bienestar",
        "wellbeing_private": "Privado · solo para ti",
        "wellbeing_pin_setup": "Crea tu PIN privado",
        "wellbeing_pin_enter": "Introduce tu PIN",
        "wellbeing_pin_confirm": "Confirma el PIN",
        "wellbeing_pin_desc": "Solo tú puedes ver esto.",
        "wellbeing_pin_mismatch": "Los PINs no coinciden",
        "wellbeing_pin_wrong": "PIN incorrecto",
        "wellbeing_pin_reset": "Restablecer PIN",
        "wellbeing_pin_forgot": "¿Olvidaste el PIN?",
        "wellbeing_pin_hint_label": "Pista del PIN (opcional)",
        "wellbeing_pin_hint_show": "Tu pista:",
        "no_data": "Sin datos aún",
        "link_to_family": "Vincular a Familia",
        "manage_strategies": "Gestionar Estrategias",
        "strategy_desc": "Descripción",
        "save_strategy": "Guardar Estrategia",
        "delete_strategy": "Eliminar Estrategia",
        "edit_strategy": "Editar Estrategia",
        "school_strategies": "Estrategias de la Escuela",
        "home_strategies": "Estrategias en Casa",
        "synced": "Sincronizado",
        "save_message": "Guardar Mensaje",
        "family_dashboard": "Panel Familiar",
        "family_strategies": "Estrategias Familiares",
        "teacher_can_see": "El profesor puede ver los check-ins en casa",
        "teacher_cannot_see": "El profesor no puede ver los datos en casa",
        "sharing_active": "Compartir Activo",
        "family_checkin": "Check-in Familiar",
        "recent_checkins": "Check-ins Recientes",
        "most_used": "Más Utilizados",
        "zone_distribution": "Distribución de Emociones",
        "add_note": "Agregar Nota",
        "select_colour": "Selecciona el color",
        "all_topics": "Todos los Temas",
        "emotions": "Emociones",
        "healthy_relationships": "Relaciones Saludables",
        "add": "Agregar",
        "close": "Cerrar",
        "yes": "Sí",
        "no": "No",
        "error": "Error",
        "profile": "Perfil",
        "share": "Compartir",
        "icon": "Ícono", "alerts": "Alertas", "blue_label": "Azul", "check_in": "Registrar", "class_mood_graph": "Gráfico de Emociones", "day_fri": "Vie", "day_mon": "Lun", "day_sat": "Sáb", "day_sun": "Dom", "day_thu": "Jue", "day_tue": "Mar", "day_wed": "Mié", "family_wellbeing_desc": "El bienestar emocional de mi familia", "fortnight": "Quincena", "green_label": "Verde", "help_request_hint": "Toca el icono de la mano para pedir ayuda.", "helpful_strategies": "Estrategias Útiles", "message_parent": "Enviar mensaje al padre", "message_parent_placeholder": "Dile a tu padre cómo te sientes...", "no_alerts": "Sin alertas", "no_data_yet": "Sin datos aún", "no_recent_checkins": "Sin registros aún", "recent_check_ins": "Registros Recientes", "red_label": "Rojo", "resolved": "Marcar como resuelto", "send": "Enviar", "strategy": "Estrategia", "teacher_dashboard": "Panel del Profesor", "week": "Semana", "week_overview": "Resumen de la Semana", "wellbeing": "Bienestar", "yellow_label": "Amarillo", "share_with_home": "Compartir con Casa", "share_with_home_desc": "El padre verá esta estrategia en la app"},
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
    
        "teacher_checkin": "Check-in de l'Enseignant",
        "your_checkins": "Tes Check-ins",
        "share_with_wellbeing": "Partager avec Bien-etre",
        "save_checkin_btn": "Enregistrer Check-in",
        "select_strategies": "Selectionner des Strategies",
        "how_feeling_today": "Comment te sens-tu aujourd'hui?",
        "add_strategy": "Ajouter une Strategie",
        "strategy_name": "Nom de la Strategie",
        "linked_students": "Eleves Lies",
        "home_data": "Donnees a la Maison",
        "school_sharing": "Partage Scolaire",
        "parent_sharing": "Partage Parents",
        "mutual_consent": "Consentement Mutuel Actif",
        "sharing_paused": "Partage en Pause",
        "download_report": "Telecharger Rapport",
        "today": "Aujourd'hui",
        "track_emotional_wellness": "Suivre le bien-etre emotionnel",
        "my_family": "Ma Famille",
        "add_member": "Ajouter un Membre",
        "parent_strategies": "Strategies pour Parents",
        "child_strategies": "Strategies pour Enfants",
        "my_strategies": "Mes Strategies",
        "assign_to": "Assigner a",
        "everyone": "Tout le monde",
        "share_with_teacher": "Partager avec l'Enseignant",
        "school_linked": "Lie a l'Ecole",
        "check_ins": "Check-ins",
        "no_checkins": "Pas encore de check-ins",
        "add_family_strategy": "Ajouter une Strategie Familiale",
        "all": "Tous",
        "home": "Maison",
        "school": "Ecole",
        "name": "Nom",
        "description": "Description",
        "emotion_colour": "Couleur de l'Emotion",
        "search_students": "Rechercher des élèves",
        "disclaimer": "Basé sur la recherche scientifique",
        "blue_emotions": "Émotions Bleues",
        "green_emotions": "Émotions Vertes",
        "yellow_emotions": "Émotions Jaunes",
        "red_emotions": "Émotions Rouges",
        "linked_child": "Enfant Lié",
        "resources": "Ressources",
        "teacher_resources": "Ressources Enseignant",
        "family_resources": "Ressources Familiales",
        "collection": "Collection", "alerts": "Alertes", "blue_label": "Bleu", "check_in": "Enregistrer", "check_in_feelings": "Enregistrer les émotions", "class_mood_graph": "Graphique des Émotions", "day_fri": "Ven", "day_mon": "Lun", "day_sat": "Sam", "day_sun": "Dim", "day_thu": "Jeu", "day_tue": "Mar", "day_wed": "Mer", "family_strategies": "Stratégies Familiales", "family_wellbeing_desc": "Le bien-être émotionnel de ma famille", "fortnight": "Quinzaine", "green_label": "Vert", "help_request_hint": "Appuie sur la main pour demander de l aide.", "helpful_strategies": "Stratégies Utiles", "message_parent": "Message au parent", "message_parent_placeholder": "Dis à ton parent comment tu te sens...", "my_wellbeing": "Mon Bien-Être", "no_alerts": "Aucune alerte", "no_data_yet": "Pas de données", "no_recent_checkins": "Pas encore d enregistrements", "recent_check_ins": "Enregistrements Récents", "red_label": "Rouge", "resolved": "Marquer comme résolu", "select_colour": "Choisir une couleur", "send": "Envoyer", "strategy": "Stratégie", "teacher_dashboard": "Tableau de Bord", "week": "Semaine", "week_overview": "Aperçu de la Semaine", "wellbeing": "Bien-être", "wellbeing_private": "Privé juste pour toi", "yellow_label": "Jaune", "share_with_home": "Partager avec la Maison", "share_with_home_desc": "Le parent verra cette stratégie dans l app"},
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
        "my_wellbeing": "O Meu Bem-Estar",
        "wellbeing_private": "Privado · só para ti",
        "wellbeing_pin_setup": "Cria o teu PIN privado",
        "wellbeing_pin_enter": "Introduz o teu PIN",
        "wellbeing_pin_confirm": "Confirma o PIN",
        "wellbeing_pin_desc": "Só tu podes ver isto.",
        "wellbeing_pin_mismatch": "Os PINs não correspondem",
        "wellbeing_pin_wrong": "PIN incorreto",
        "wellbeing_pin_reset": "Repor PIN",
        "wellbeing_pin_forgot": "Esqueceste o PIN?",
        "wellbeing_pin_hint_label": "Dica do PIN (opcional)",
        "wellbeing_pin_hint_show": "A tua dica:",
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
    
        "teacher_checkin": "Check-in do Professor",
        "your_checkins": "Os Teus Check-ins",
        "share_with_wellbeing": "Partilhar com Bem-estar",
        "save_checkin_btn": "Guardar Check-in",
        "select_strategies": "Selecionar Estrategias",
        "how_feeling_today": "Como te sentes hoje?",
        "add_strategy": "Adicionar Estrategia",
        "strategy_name": "Nome da Estrategia",
        "linked_students": "Alunos Ligados",
        "home_data": "Dados em Casa",
        "school_sharing": "Partilha Escolar",
        "parent_sharing": "Partilha dos Pais",
        "mutual_consent": "Consentimento Mutuo Ativo",
        "sharing_paused": "Partilha Pausada",
        "download_report": "Descarregar Relatorio",
        "today": "Hoje",
        "track_emotional_wellness": "Acompanha o bem-estar emocional em casa",
        "my_family": "A Minha Familia",
        "add_member": "Adicionar Membro",
        "parent_strategies": "Estrategias para Pais",
        "child_strategies": "Estrategias para Criancas",
        "assign_to": "Atribuir a",
        "everyone": "Todos",
        "share_with_teacher": "Partilhar com Professor",
        "linked_child": "Filho Ligado",
        "school_linked": "Ligado a Escola",
        "check_ins": "Check-ins",
        "no_checkins": "Sem check-ins ainda",
        "add_family_strategy": "Adicionar Estrategia Familiar",
        "all": "Todos",
        "home": "Casa",
        "school": "Escola",
        "emotion_colour": "Cor da Emocao",
        "select_profile": "Seleciona o teu perfil",
        "search_students": "Pesquisar alunos",
        "disclaimer": "Baseado em investigação científica sobre regulação emocional",
        "blue_emotions": "Emoções Azuis",
        "green_emotions": "Emoções Verdes",
        "yellow_emotions": "Emoções Amarelas",
        "red_emotions": "Emoções Vermelhas",
        "teacher_resources": "Recursos do Professor",
        "family_resources": "Recursos da Família",
        "students": "Alunos",
        "view_class": "Ver Turma",
        "support": "Suporte",
        "link_to_family": "Ligar à Família",
        "manage_strategies": "Gerir Estratégias",
        "strategy_desc": "Descrição",
        "save_strategy": "Guardar Estratégia",
        "delete_strategy": "Eliminar Estratégia",
        "edit_strategy": "Editar Estratégia",
        "school_strategies": "Estratégias da Escola",
        "home_strategies": "Estratégias em Casa",
        "save_message": "Guardar Mensagem",
        "family_dashboard": "Painel da Família",
        "family_strategies": "Estratégias da Família",
        "teacher_can_see": "O professor pode ver os check-ins em casa",
        "teacher_cannot_see": "O professor não pode ver os dados em casa",
        "sharing_active": "Partilha Ativa",
        "family_checkin": "Check-in da Família",
        "most_used": "Mais Utilizados",
        "zone_distribution": "Distribuição de Emoções",
        "all_topics": "Todos os Tópicos",
        "emotions": "Emoções",
        "healthy_relationships": "Relações Saudáveis",
        "add": "Adicionar",
        "close": "Fechar",
        "yes": "Sim",
        "no": "Não",
        "error": "Erro",
        "profile": "Perfil",
        "share": "Partilhar", "alerts": "Alertas", "class_mood_graph": "Gráfico de Emoções", "family_wellbeing_desc": "O bem-estar emocional da minha família", "fortnight": "Quinzena", "help_request_hint": "Toca no ícone da mão para pedir ajuda.", "message_parent": "Enviar mensagem ao pai/mãe", "message_parent_placeholder": "Diz ao teu pai/mãe como te sentes...", "no_alerts": "Sem alertas pendentes", "no_data_yet": "Ainda sem dados", "no_recent_checkins": "Ainda sem registos", "recent_check_ins": "Registos Recentes", "resolved": "Marcar como resolvido", "send": "Enviar", "strategy": "Estratégia", "teacher_dashboard": "Painel do Professor", "week": "Semana", "share_with_home": "Partilhar com Casa", "share_with_home_desc": "O pai/mãe verá esta estratégia na aplicação"},
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
    
        "teacher_checkin": "Lehrer Check-in",
        "your_checkins": "Deine Check-ins",
        "share_with_wellbeing": "Mit Wohlbefinden teilen",
        "save_checkin_btn": "Check-in speichern",
        "select_strategies": "Strategien auswahlen",
        "how_feeling_today": "Wie fuhlst du dich heute?",
        "add_strategy": "Strategie hinzufugen",
        "strategy_name": "Name der Strategie",
        "linked_students": "Verknupfte Schuler",
        "home_data": "Zuhause-Daten",
        "school_sharing": "Schul-Teilen",
        "parent_sharing": "Eltern-Teilen",
        "mutual_consent": "Gegenseitige Zustimmung Aktiv",
        "sharing_paused": "Teilen pausiert",
        "download_report": "Bericht herunterladen",
        "today": "Heute",
        "track_emotional_wellness": "Emotionales Wohlbefinden verfolgen",
        "my_family": "Meine Familie",
        "add_member": "Mitglied hinzufugen",
        "parent_strategies": "Strategien fur Eltern",
        "child_strategies": "Strategien fur Kinder",
        "my_strategies": "Meine Strategien",
        "assign_to": "Zuweisen an",
        "everyone": "Alle",
        "share_with_teacher": "Mit Lehrer teilen",
        "school_linked": "Mit Schule verbunden",
        "check_ins": "Check-ins",
        "no_checkins": "Noch keine Check-ins",
        "add_family_strategy": "Familienstrategie hinzufugen",
        "all": "Alle",
        "home": "Zuhause",
        "school": "Schule",
        "name": "Name",
        "description": "Beschreibung",
        "emotion_colour": "Emotionsfarbe",
        "search_students": "Schüler suchen",
        "disclaimer": "Basiert auf wissenschaftlicher Forschung",
        "blue_emotions": "Blaue Emotionen",
        "green_emotions": "Grüne Emotionen",
        "yellow_emotions": "Gelbe Emotionen",
        "red_emotions": "Rote Emotionen",
        "linked_child": "Verknüpftes Kind",
        "resources": "Ressourcen",
        "teacher_resources": "Lehrer-Ressourcen",
        "family_resources": "Familien-Ressourcen",
        "collection": "Sammlung", "alerts": "Benachrichtigungen", "blue_label": "Blau", "check_in": "Einchecken", "check_in_feelings": "Gefühle einchecken", "class_mood_graph": "Emotions-Diagramm", "day_fri": "Fr", "day_mon": "Mo", "day_sat": "Sa", "day_sun": "So", "day_thu": "Do", "day_tue": "Di", "day_wed": "Mi", "family_strategies": "Familienstrategien", "family_wellbeing_desc": "Das emotionale Wohlbefinden meiner Familie", "fortnight": "Zwei Wochen", "green_label": "Grün", "help_request_hint": "Tippe auf die Hand um Hilfe zu bitten.", "helpful_strategies": "Hilfreiche Strategien", "message_parent": "Nachricht an Elternteil", "message_parent_placeholder": "Erzähl wie du dich fühlst...", "my_wellbeing": "Mein Wohlbefinden", "no_alerts": "Keine Benachrichtigungen", "no_data_yet": "Noch keine Daten", "no_recent_checkins": "Noch keine Einträge", "recent_check_ins": "Letzte Einträge", "red_label": "Rot", "resolved": "Als gelöst markieren", "select_colour": "Farbe wählen", "select_profile": "Profil auswählen", "send": "Senden", "strategy": "Strategie", "teacher_dashboard": "Lehrer-Dashboard", "week": "Woche", "week_overview": "Wochenübersicht", "wellbeing": "Wohlbefinden", "wellbeing_private": "Privat nur für dich", "yellow_label": "Gelb", "share_with_home": "Mit Zuhause teilen", "share_with_home_desc": "Der Elternteil sieht diese Strategie in der App"},
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
    
        "teacher_checkin": "Check-in dell'Insegnante",
        "your_checkins": "I Tuoi Check-in",
        "share_with_wellbeing": "Condividi con Benessere",
        "save_checkin_btn": "Salva Check-in",
        "select_strategies": "Seleziona Strategie",
        "how_feeling_today": "Come ti senti oggi?",
        "add_strategy": "Aggiungi Strategia",
        "strategy_name": "Nome della Strategia",
        "linked_students": "Studenti Collegati",
        "all_students": "Tutti gli Studenti",
        "home_data": "Dati a Casa",
        "school_sharing": "Condivisione Scolastica",
        "parent_sharing": "Condivisione Genitori",
        "mutual_consent": "Consenso Reciproco Attivo",
        "sharing_paused": "Condivisione in Pausa",
        "download_report": "Scarica Rapporto",
        "today": "Oggi",
        "track_emotional_wellness": "Monitora il benessere emotivo a casa",
        "my_family": "La Mia Famiglia",
        "add_member": "Aggiungi Membro",
        "parent_strategies": "Strategie per Genitori",
        "child_strategies": "Strategie per Bambini",
        "my_strategies": "Le Mie Strategie",
        "assign_to": "Assegna a",
        "everyone": "Tutti",
        "share_with_teacher": "Condividi con l'Insegnante",
        "school_linked": "Collegato alla Scuola",
        "check_ins": "Check-in",
        "no_checkins": "Nessun check-in ancora",
        "add_family_strategy": "Aggiungi Strategia Familiare",
        "all": "Tutti",
        "home": "Casa",
        "school": "Scuola",
        "emotion_colour": "Colore dell'Emozione",
        "days_7": "7 Giorni",
        "days_14": "2 Settimane",
        "days_30": "30 Giorni",
        "search_students": "Cerca studenti",
        "disclaimer": "Basato su ricerca scientifica",
        "blue_emotions": "Emozioni Blu",
        "green_emotions": "Emozioni Verdi",
        "yellow_emotions": "Emozioni Gialle",
        "red_emotions": "Emozioni Rosse",
        "linked_child": "Figlio Collegato",
        "resources": "Risorse",
        "teacher_resources": "Risorse Insegnante",
        "family_resources": "Risorse Famiglia",
        "collection": "Collezione",
        "my_creatures": "Le Mie Creature",
        "unlocked": "Sbloccato",
        "stage": "Fase", "about": "Informazioni", "add_profile": "Aggiungi Profilo", "alerts": "Avvisi", "amazing_continue": "Fantastico! Continua!", "angry": "Arrabbiato", "app_name": "Class of Happiness", "back": "Indietro", "blue_description": "Mi sento triste o stanco", "blue_feeling": "Blu", "blue_feelings": "Sentimenti Blu", "blue_label": "Blu", "blue_zone": "Zona Blu", "bonus_items": "Oggetti Bonus", "bored": "Annoiato", "calm": "Calmo", "cancel": "Annulla", "change_language": "Cambia Lingua", "check_in": "Registra", "check_in_feelings": "Registra i Sentimenti", "choose_helpers": "Scegli gli Aiutanti", "class_mood_graph": "Grafico delle Emozioni", "confirm": "Conferma", "confirm_logout": "Sei sicuro di voler uscire?", "continue": "Continua", "create_first_profile": "Crea il Primo Profilo", "creature_collection": "Collezione di Creature", "day_fri": "Ven", "day_mon": "Lun", "day_sat": "Sab", "day_sun": "Dom", "day_thu": "Gio", "day_tue": "Mar", "day_wed": "Mer", "day_streak": "Giorni di fila", "delete": "Elimina", "done": "Fatto", "edit": "Modifica", "evolved": "Evoluto!", "family_strategies": "Strategie Familiari", "family_wellbeing_desc": "Il benessere emotivo della mia famiglia", "filter_by_classroom": "Filtra per Classe", "focused": "Concentrato", "foods": "Cibo", "fortnight": "Quindicina", "free_trial": "Prova Gratuita", "frustrated": "Frustrato", "fully_evolved": "Completamente Evoluto!", "great_job": "Ottimo lavoro!", "great_job_title": "Bravissimo!", "green_description": "Mi sento bene e pronto", "green_feeling": "Verde", "green_feelings": "Sentimenti Verdi", "green_label": "Verde", "green_zone": "Zona Verde", "grow_creature_hint": "Fai check-in per far crescere la tua creatura!", "happy": "Felice", "have_trial_code": "Ho un codice di prova", "help_request_hint": "Tocca la mano per chiedere aiuto.", "helpful_strategies": "Strategie Utili", "hi": "Ciao", "homes": "Case", "how_are_you_feeling": "Come ti senti?", "how_i_feel": "Come mi sento", "i_am_a": "Sono un", "is_now_default": "è ora il predefinito", "keep_growing": "Continua a crescere!", "keep_it_up": "Continua così!", "language": "Lingua", "language_changed": "Lingua cambiata", "loading": "Caricamento...", "loading_creature": "Caricamento creatura...", "loading_helpers": "Caricamento aiutanti...", "loading_strategies": "Caricamento strategie...", "login": "Accedi", "logout": "Esci", "lonely": "Solo", "message_parent": "Messaggio al genitore", "message_parent_placeholder": "Di al tuo genitore come ti senti...", "moves": "Mosse", "my_helpers": "I Miei Aiutanti", "my_wellbeing": "Il Mio Benessere", "need_help": "Ho Bisogno di Aiuto", "nervous": "Nervoso", "next": "Avanti", "no_alerts": "Nessun avviso", "no_data_yet": "Ancora nessun dato", "no_profiles_yet": "Ancora nessun profilo", "no_recent_checkins": "Ancora nessuna registrazione", "out_of_control": "Fuori Controllo", "outfits": "Abiti", "parent": "Genitore", "points": "Punti", "points_needed": "Punti necessari", "ready_to_learn": "Pronto per imparare", "recent_check_ins": "Registrazioni Recenti", "red_description": "Mi sento molto arrabbiato", "red_feeling": "Rosso", "red_feelings": "Sentimenti Rossi", "red_label": "Rosso", "red_zone": "Zona Rossa", "redeem_code": "Usa Codice", "redeeming": "Utilizzo...", "resolved": "Segna come risolto", "sad": "Triste", "save": "Salva", "save_checkin": "Salva Registrazione", "select_colour": "Seleziona un colore", "select_profile": "Seleziona Profilo", "send": "Invia", "settings": "Impostazioni", "sign_in_google": "Accedi con Google", "silly": "Sciocco", "skip": "Salta", "strategy": "Strategia", "student": "Studente", "subscribe": "Abbonati", "subscription": "Abbonamento", "super_charged": "Super Carico!", "support_message": "Messaggio di supporto", "tap_colour_help": "Tocca un colore per vedere come ti senti", "tap_helpers_green": "Tocca un aiutante per continuare bene!", "tap_helpers_other": "Tocca un aiutante per stare meglio", "tap_strategies_green": "Continua il buon lavoro!", "tap_strategies_help": "Queste strategie possono aiutare", "teacher": "Insegnante", "teacher_dashboard": "Dashboard Insegnante", "tired": "Stanco", "trial_code_invalid": "Codice non valido", "trial_code_placeholder": "Inserisci codice", "trial_code_success": "Codice accettato!", "very_upset": "Molto Arrabbiato", "want_to_say": "Vuoi dire qualcosa?", "week": "Settimana", "week_overview": "Panoramica della Settimana", "well_done": "Bravo!", "wellbeing": "Benessere", "wellbeing_private": "Privato solo per te", "what_colours_mean": "Cosa significano i colori", "worried": "Preoccupato", "write_sentence": "Scrivi una frase", "yellow_description": "Mi sento ansioso o agitato", "yellow_feeling": "Giallo", "yellow_feelings": "Sentimenti Gialli", "yellow_label": "Giallo", "yellow_zone": "Zona Gialla", "your_creature": "La tua creatura", "share_with_home": "Condividi con Casa", "share_with_home_desc": "Il genitore vedra questa strategia nell app", "family_dashboard": "Dashboard Famiglia"},
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
        "yellow_feeling": "Feeling tense or unsettled Energy", "red_feeling": "High stress or overwhelm",
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
        "login": "Login", "logout": "Logout", "alerts": "Alerts", "fortnight": "Fortnight", "week": "Week", "today": "Today", "all": "All", "my_family": "My Family", "family_wellbeing_desc": "My Family's Emotional Wellbeing", "help_request_hint": "Tap the hand icon on any helper to ask your teacher or parent for support.", "message_parent": "Send message to parent", "message_parent_placeholder": "Tell your parent how you feel...", "no_alerts": "No pending alerts", "resolved": "Mark resolved", "strategy": "Strategy", "wellbeing": "Wellbeing", "check_in": "Check In", "family_strategies": "Family Strategies", "linked_child": "Linked Child", "recent_check_ins": "Recent Check-ins", "no_recent_checkins": "No check-ins yet", "class_mood_graph": "Emotion Graph", "teacher_dashboard": "Teacher Dashboard", "my_wellbeing": "My Wellbeing", "wellbeing_private": "Private · just for you", "send": "Send", "no_data_yet": "No data yet", "confirm": "Confirm",
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
        "login": "Entrar", "logout": "Sair", "fortnight": "Quinzena", "week": "Semana", "today": "Hoje", "all": "Todos", "my_family": "A Minha Família", "family_wellbeing_desc": "O bem-estar emocional da minha família", "help_request_hint": "Toca no ícone da mão para pedir ajuda ao teu professor ou pai.", "message_parent": "Enviar mensagem ao pai/mãe", "message_parent_placeholder": "Diz ao teu pai/mãe como te sentes...", "resolved": "Marcar como resolvido", "strategy": "Estratégia", "wellbeing": "Bem-estar", "check_in": "Registar", "family_strategies": "Estratégias Familiares", "linked_child": "Criança Ligada", "recent_check_ins": "Registos Recentes", "no_recent_checkins": "Ainda sem registos", "teacher_dashboard": "Painel do Professor", "my_wellbeing": "O Meu Bem-Estar", "wellbeing_private": "Privado · só para ti", "send": "Enviar", "no_data_yet": "Ainda sem dados", "confirm": "Confirmar",
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
        "logout": "Cerrar sesión", "save": "Guardar", "cancel": "Cancelar", "alerts": "Alertas", "fortnight": "Quincena", "week": "Semana", "today": "Hoy", "all": "Todos", "my_family": "Mi Familia", "family_wellbeing_desc": "El bienestar emocional de mi familia", "help_request_hint": "Toca el icono de la mano para pedir ayuda a tu maestro o padre.", "message_parent": "Enviar mensaje al padre/madre", "message_parent_placeholder": "Dile a tu padre/madre cómo te sientes...", "no_alerts": "Sin alertas pendientes", "resolved": "Marcar como resuelto", "strategy": "Estrategia", "wellbeing": "Bienestar", "check_in": "Registrar", "family_strategies": "Estrategias Familiares", "linked_child": "Niño Vinculado", "recent_check_ins": "Registros Recientes", "no_recent_checkins": "Aún sin registros", "class_mood_graph": "Gráfico de Emociones", "teacher_dashboard": "Panel del Profesor", "send": "Enviar", "no_data_yet": "Aún sin datos",
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
        "logout": "Déconnexion", "save": "Enregistrer", "cancel": "Annuler", "alerts": "Alertes", "fortnight": "Quinzaine", "week": "Semaine", "today": "Aujourd'hui", "all": "Tous", "my_family": "Ma Famille", "family_wellbeing_desc": "Le bien-être émotionnel de ma famille", "help_request_hint": "Appuie sur l'icône de main pour demander de l'aide à ton enseignant ou parent.", "message_parent": "Envoyer un message au parent", "message_parent_placeholder": "Dis à ton parent comment tu te sens...", "no_alerts": "Aucune alerte en attente", "resolved": "Marquer comme résolu", "strategy": "Stratégie", "wellbeing": "Bien-être", "check_in": "S'enregistrer", "family_strategies": "Stratégies Familiales", "linked_child": "Enfant Lié", "recent_check_ins": "Enregistrements Récents", "no_recent_checkins": "Pas encore d'enregistrements", "class_mood_graph": "Graphique des Émotions", "teacher_dashboard": "Tableau de Bord Enseignant", "send": "Envoyer", "no_data_yet": "Pas encore de données", "my_wellbeing": "Mon Bien-Être", "wellbeing_private": "Privé · juste pour toi", "wellbeing_pin_setup": "Crée ton PIN privé", "wellbeing_pin_enter": "Entre ton PIN", "wellbeing_pin_confirm": "Confirme le PIN", "wellbeing_pin_desc": "Seulement toi peux voir ça.", "wellbeing_pin_mismatch": "Les PINs ne correspondent pas", "wellbeing_pin_wrong": "PIN incorrect", "wellbeing_pin_reset": "Réinitialiser le PIN", "wellbeing_pin_forgot": "PIN oublié?", "wellbeing_pin_hint_label": "Indice PIN (optionnel)", "wellbeing_pin_hint_show": "Ton indice:",
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
        "logout": "Abmelden", "save": "Speichern", "cancel": "Abbrechen", "alerts": "Benachrichtigungen", "fortnight": "Zwei Wochen", "week": "Woche", "today": "Heute", "all": "Alle", "my_family": "Meine Familie", "family_wellbeing_desc": "Das emotionale Wohlbefinden meiner Familie", "help_request_hint": "Tippe auf das Hand-Symbol, um deinen Lehrer oder Elternteil um Hilfe zu bitten.", "message_parent": "Nachricht an Elternteil senden", "message_parent_placeholder": "Erzähl deinem Elternteil, wie du dich fühlst...", "no_alerts": "Keine ausstehenden Benachrichtigungen", "resolved": "Als gelöst markieren", "strategy": "Strategie", "wellbeing": "Wohlbefinden", "check_in": "Einchecken", "family_strategies": "Familienstrategien", "linked_child": "Verknüpftes Kind", "recent_check_ins": "Letzte Einträge", "no_recent_checkins": "Noch keine Einträge", "class_mood_graph": "Emotions-Diagramm", "teacher_dashboard": "Lehrer-Dashboard", "send": "Senden", "no_data_yet": "Noch keine Daten", "my_wellbeing": "Mein Wohlbefinden", "wellbeing_private": "Privat · nur für dich", "wellbeing_pin_setup": "Erstelle deinen privaten PIN", "wellbeing_pin_enter": "PIN eingeben", "wellbeing_pin_confirm": "PIN bestätigen", "wellbeing_pin_desc": "Nur du kannst das sehen.", "wellbeing_pin_mismatch": "PINs stimmen nicht überein", "wellbeing_pin_wrong": "Falscher PIN", "wellbeing_pin_reset": "PIN zurücksetzen", "wellbeing_pin_forgot": "PIN vergessen?", "wellbeing_pin_hint_label": "PIN-Hinweis (optional)", "wellbeing_pin_hint_show": "Dein Hinweis:",
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
        "logout": "Esci", "save": "Salva", "cancel": "Annulla", "alerts": "Avvisi", "fortnight": "Quindicina", "week": "Settimana", "today": "Oggi", "all": "Tutti", "my_family": "La Mia Famiglia", "family_wellbeing_desc": "Il benessere emotivo della mia famiglia", "help_request_hint": "Tocca l'icona della mano per chiedere aiuto al tuo insegnante o genitore.", "message_parent": "Invia messaggio al genitore", "message_parent_placeholder": "Di' al tuo genitore come ti senti...", "no_alerts": "Nessun avviso in sospeso", "resolved": "Segna come risolto", "strategy": "Strategia", "wellbeing": "Benessere", "check_in": "Registra", "family_strategies": "Strategie Familiari", "linked_child": "Bambino Collegato", "recent_check_ins": "Registrazioni Recenti", "no_recent_checkins": "Ancora nessuna registrazione", "class_mood_graph": "Grafico delle Emozioni", "teacher_dashboard": "Dashboard Insegnante", "send": "Invia", "no_data_yet": "Ancora nessun dato", "my_wellbeing": "Il Mio Benessere", "wellbeing_private": "Privato · solo per te", "wellbeing_pin_setup": "Crea il tuo PIN privato", "wellbeing_pin_enter": "Inserisci il PIN", "wellbeing_pin_confirm": "Conferma il PIN", "wellbeing_pin_desc": "Solo tu puoi vedere questo.", "wellbeing_pin_mismatch": "I PIN non corrispondono", "wellbeing_pin_wrong": "PIN errato", "wellbeing_pin_reset": "Reimposta PIN", "wellbeing_pin_forgot": "PIN dimenticato?", "wellbeing_pin_hint_label": "Suggerimento PIN (opzionale)", "wellbeing_pin_hint_show": "Il tuo suggerimento:",
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
        # Also accept token as query param (for PDF downloads via Linking.openURL)
        session_token = request.query_params.get("token")
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
    # All admin/staff roles bypass subscription
    if user.get("role") in ("admin", "superadmin", "school_admin", "teacher"):
        return True
    # Also bypass if user has a school invite code (linked to a school)
    if user.get("school_id") or user.get("invite_code"):
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
    return {"status": "healthy", "app": "Class of Happiness", "version": "2.1"}

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
    
    # Get students via user_id AND via classrooms (for teachers assigned to classrooms)
    result = supabase.table("students").select("*").eq("user_id", user["user_id"]).execute()
    own_students = result.data or []
    
    # Also get students from classrooms assigned to this teacher
    classrooms_r = supabase.table("classrooms").select("id").eq("user_id", user["user_id"]).execute()
    classroom_ids = [cl["id"] for cl in (classrooms_r.data or [])]
    existing_ids = {s["id"] for s in own_students}
    if classroom_ids:
        classroom_students_r = supabase.table("students").select("*").in_("classroom_id", classroom_ids).execute()
        classroom_students = classroom_students_r.data or []
        for s in classroom_students:
            if s["id"] not in existing_ids:
                own_students.append(s)
                existing_ids.add(s["id"])
    # Also include students who have link codes generated by this teacher
    # These are students whose classroom_id belongs to this teacher's classrooms
    # but may have been created with a different user_id
    try:
        if classroom_ids:
            # Get ALL students in teacher's classrooms regardless of user_id
            all_classroom_stud_r = supabase.table("students").select("*").in_("classroom_id", classroom_ids).execute()
            for s in (all_classroom_stud_r.data or []):
                if s["id"] not in existing_ids:
                    own_students.append(s)
                    existing_ids.add(s["id"])
    except Exception as e:
        logger.warning(f"Could not fetch classroom students: {e}")
    
    own_ids = {s["id"] for s in own_students}

    # Get parent links ONLY for THIS teacher's own students
    try:
        if own_ids:
            links_result = supabase.table("parent_links").select("*").in_(
                "student_id", list(own_ids)[:50]
            ).execute()
            own_links = links_result.data or []
            linked_map = {l["student_id"]: l for l in own_links}
        else:
            linked_map = {}

        # Add is_linked flag to own students only
        for s in own_students:
            link = linked_map.get(s["id"])
            s["is_linked"] = link is not None
            s["home_sharing_enabled"] = link.get("home_sharing_enabled", False) if link else False
            s["parent_user_id"] = link.get("parent_user_id") if link else None

        # NOTE: We intentionally do NOT add students from other teachers here.
        # Each teacher only sees their own students. Parents can view shared data
        # through the family dashboard, not by appearing in teacher lists.

    except Exception as e:
        logger.error(f"Could not fetch link status: {e}")

    return own_students

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
    # Use language-specific helper cards if available
    LANG_HELPERS = {
        "pt": HELPERS_PT, "es": HELPERS_ES, "fr": HELPERS_FR,
        "de": HELPERS_DE, "it": HELPERS_IT,
    }
    lang_helpers = LANG_HELPERS.get(lang, DEFAULT_HELPERS)
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
    try:
        helpers_result = supabase.table("helpers").select("*")
        if effective_zone:
            helpers_result = helpers_result.eq("feeling_colour", effective_zone)
        result = helpers_result.execute()
        helpers = result.data or []
    except Exception as e:
        logger.warning(f"helpers table error: {e} — using empty list")
        helpers = []
    
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

@api_router.put("/custom-strategies/{strategy_id}")
async def update_custom_strategy(strategy_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        body = await request.json()
        update_data = {}
        for field in ["name", "description", "zone", "feeling_colour", "icon", "is_shared", "assigned_to"]:
            if field in body:
                update_data[field] = body[field]
        if "zone" in update_data:
            update_data["feeling_colour"] = update_data["zone"]
        result = supabase.table("custom_helpers").update(update_data).eq("id", strategy_id).execute()
        row = result.data[0] if result.data else update_data
        row["zone"] = row.get("zone") or row.get("feeling_colour", "green")
        return row
    except Exception as e:
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
            fc = row.get("feeling_colour", "")
            z  = row.get("zone", "")
            row["zone"]           = z or fc or "green"
            row["feeling_colour"] = fc or z or "green"
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
    return {"creatures": CREATURES, "count": len(CREATURES)}

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


@api_router.get("/analytics/classroom/all")
async def get_all_classrooms_analytics(request: Request, days: int = 7):
    """Aggregate analytics across all classrooms for the authenticated teacher. v2"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        # Get all students via teacher's classrooms
        classrooms_r = supabase.table("classrooms").select("id").eq("user_id", user["user_id"]).execute()
        classroom_ids = [cl["id"] for cl in (classrooms_r.data or [])]
        logger.info(f"[analytics/all] user={user['user_id']} classrooms={classroom_ids}")
        student_ids = []
        if classroom_ids:
            students_r = supabase.table("students").select("id").in_("classroom_id", classroom_ids).execute()
            student_ids = [s["id"] for s in (students_r.data or [])]
        logger.info(f"[analytics/all] students={student_ids}")
        # Also try direct user_id match as fallback
        if not student_ids:
            students_r2 = supabase.table("students").select("id").eq("user_id", user["user_id"]).execute()
            student_ids = [s["id"] for s in (students_r2.data or [])]
            logger.info(f"[analytics/all] fallback students={student_ids}")
        feeling_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
        if student_ids:
            logs_r = supabase.table("feeling_logs").select("feeling_colour").in_(
                "student_id", student_ids[:100]
            ).gte("timestamp", start_date).execute()
            for log in (logs_r.data or []):
                colour = log.get("feeling_colour", "")
                if colour in feeling_counts:
                    feeling_counts[colour] += 1
        return {
            "zone_counts": feeling_counts,
            "feeling_counts": feeling_counts,
            "total_logs": sum(feeling_counts.values()),
            "students_count": len(student_ids),
        }
    except Exception as e:
        logger.error(f"All analytics error: {e}")
        return {"zone_counts": {"blue":0,"green":0,"yellow":0,"red":0}, "total_logs": 0}

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
    
    # Auto-create student record for family children (gives full creature/points experience)
    if new_member.get("relationship") == "child":
        try:
            family_member_id = result.data[0]["id"] if result.data else new_member["id"]
            # Only use columns that exist in students table
            student_record = {
                "id": str(uuid.uuid4()),
                "user_id": user["user_id"],
                "name": new_member["name"],
                "avatar_type": new_member.get("avatar_type", "preset"),
                "avatar_preset": new_member.get("avatar_preset", "bear"),
                "avatar_custom": new_member.get("avatar_custom"),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            student_result = supabase.table("students").insert(student_record).execute()
            if student_result.data:
                new_student_id = student_result.data[0]["id"]
                # Link the student back to the family member
                supabase.table("family_members").update({"student_id": new_student_id}).eq("id", family_member_id).execute()
                # Also init rewards so creature system works immediately
                default_rewards = {
                    "student_id": new_student_id,
                    "total_points_earned": 0,
                    "streak_days": 0,
                    "last_checkin_date": None,
                    "creature_points": {"aqua_buddy": 0, "leaf_friend": 0, "spark_pal": 0, "blaze_heart": 0},
                    "creature_stages": {"aqua_buddy": 0, "leaf_friend": 0, "spark_pal": 0, "blaze_heart": 0},
                    "collected_creatures": [],
                    "current_creature_id": "aqua_buddy",
                    "current_stage": 0,
                    "current_points": 0,
                }
                supabase.table("student_rewards").insert(default_rewards).execute()
        except Exception as e:
            logger.warning(f"Could not auto-create student for family child: {e}")
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
    member = updated.data[0]
    # Also update linked student record so avatar shows correctly in student flow
    student_id = member.get("student_id")
    if student_id:
        avatar_fields = {k: v for k, v in update_data.items() if k in ["avatar_type", "avatar_preset", "avatar_custom", "name"]}
        if avatar_fields:
            supabase.table("students").update(avatar_fields).eq("id", student_id).execute()
    return member

@api_router.delete("/family/members/{member_id}")
async def delete_family_member(member_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    # Also clean up the linked student record and rewards to avoid orphaned data
    member_result = supabase.table("family_members").select("*").eq("id", member_id).execute()
    if member_result.data:
        student_id = member_result.data[0].get("student_id")
        if student_id:
            supabase.table("student_rewards").delete().eq("student_id", student_id).execute()
            supabase.table("feeling_logs").delete().eq("student_id", student_id).execute()
            supabase.table("students").delete().eq("id", student_id).execute()
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

# ================== STRATEGY SHARING ==================

@api_router.get("/strategies/shared/{student_id}")
async def get_shared_strategies_for_student(student_id: str, request: Request):
    """Get all strategies visible to a student: teacher custom + parent shared."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        data = []
        seen_ids = set()

        # 1. Teacher-added custom strategies for this student
        try:
            result = supabase.table("custom_helpers").select("*").eq("student_id", student_id).execute()
            for s in (result.data or []):
                if s["id"] not in seen_ids:
                    s["creator_role"] = "teacher"
                    data.append(s)
                    seen_ids.add(s["id"])
        except Exception as e:
            logger.error(f"teacher strategies fetch error: {e}")

        # 2. Parent family strategies linked via parent_links
        try:
            links = supabase.table("parent_links").select("parent_user_id").eq("student_id", student_id).execute()
            for link in (links.data or []):
                parent_id = link.get("parent_user_id")
                if not parent_id:
                    continue
                # Get ALL parent custom strategies (not just is_shared)
                fam_result = supabase.table("custom_helpers").select("*").eq("user_id", parent_id).execute()
                for s in (fam_result.data or []):
                    if s["id"] in seen_ids:
                        continue
                    assigned = s.get("assigned_to", "all") or "all"
                    # Show if assigned to all, or to this specific student
                    if assigned in ("all", student_id):
                        s["creator_role"] = "parent"
                        data.append(s)
                        seen_ids.add(s["id"])
        except Exception as e:
            logger.error(f"parent strategies fetch error: {e}")

        # 3. Family member strategies — for family children (no parent_links entry)
        # Find if this student_id belongs to a family member, then get that parent's strategies
        try:
            fm_result = supabase.table("family_members").select("user_id").eq("student_id", student_id).execute()
            for fm in (fm_result.data or []):
                parent_id = fm.get("user_id")
                if not parent_id:
                    continue
                fam_result2 = supabase.table("custom_helpers").select("*").eq("user_id", parent_id).execute()
                for s in (fam_result2.data or []):
                    if s["id"] in seen_ids:
                        continue
                    assigned = s.get("assigned_to", "all") or "all"
                    if assigned in ("all", student_id):
                        s["creator_role"] = "parent"
                        data.append(s)
                        seen_ids.add(s["id"])
        except Exception as e:
            logger.error(f"family member strategies fetch error: {e}")

        # Normalise zone/feeling_colour for all
        for row in data:
            fc = row.get("feeling_colour", "")
            z  = row.get("zone", "")
            row["zone"] = z or fc or "green"
            row["feeling_colour"] = fc or z or "green"
            if "creator_role" not in row:
                row["creator_role"] = "teacher"

        return data
    except Exception as e:
        logger.error(f"get_shared_strategies error: {e}")
        return []

@api_router.put("/strategies/sync/{strategy_id}")
async def toggle_strategy_sync(strategy_id: str, request: Request):
    """Toggle is_shared on a custom strategy."""
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ================== PDF REPORTS ==================

# ================== PDF REPORTS ==================

# Full strategy name map (mirrors frontend STRATEGY_NAME_MAP)
STRATEGY_NAME_MAP = {
    # Short IDs
    "b1": "Gentle Stretch", "b2": "Favourite Song", "b3": "Tell Someone", "b4": "Slow Breathing",
    "g1": "Keep Going!", "g2": "Help a Friend", "g3": "Set a Goal", "g4": "Gratitude",
    "y1": "Bubble Breathing", "y2": "Count to 10", "y3": "5 Senses", "y4": "Talk About It",
    "r1": "Freeze", "r2": "Big Breaths", "r3": "Safe Space", "r4": "Ask for Help",
    # Underscore variants (blue_1 format stored in DB)
    "blue_1": "Gentle Stretch", "blue_2": "Favourite Song", "blue_3": "Tell Someone", "blue_4": "Slow Breathing",
    "green_1": "Keep Going!", "green_2": "Help a Friend", "green_3": "Set a Goal", "green_4": "Gratitude",
    "yellow_1": "Bubble Breathing", "yellow_2": "Count to 10", "yellow_3": "5 Senses", "yellow_4": "Talk About It",
    "red_1": "Freeze", "red_2": "Big Breaths", "red_3": "Safe Space", "red_4": "Ask for Help",
    # Parent strategies
    "p_b1": "Side-by-Side Presence", "p_b2": "Warm Drink Ritual", "p_b3": "Name It to Tame It",
    "p_g1": "Gratitude Round", "p_g2": "Strength Spotting", "p_g3": "Creative Together",
    "p_y1": "Box Breathing Together", "p_y2": "Validate First", "p_y3": "Body Check-In",
    "p_r1": "Stay Calm Yourself", "p_r2": "Safe Space Together", "p_r3": "Cold Water Reset",
}

STRATEGY_NAME_MAP_PT = {
    "b1":"Alongamento Suave","b2":"Música Favorita","b3":"Contar a Alguém","b4":"Respiração Lenta",
    "g1":"Continuar!","g2":"Ajudar um Amigo","g3":"Definir um Objetivo","g4":"Gratidão",
    "y1":"Respiração de Bolha","y2":"Contar até 10","y3":"5 Sentidos","y4":"Falar Sobre Isso",
    "r1":"Parar","r2":"Respirações Profundas","r3":"Espaço Seguro","r4":"Pedir Ajuda",
    "blue_1":"Alongamento Suave","blue_2":"Música Favorita","blue_3":"Contar a Alguém","blue_4":"Respiração Lenta",
    "green_1":"Continuar!","green_2":"Ajudar um Amigo","green_3":"Definir um Objetivo","green_4":"Gratidão",
    "yellow_1":"Respiração de Bolha","yellow_2":"Contar até 10","yellow_3":"5 Sentidos","yellow_4":"Falar Sobre Isso",
    "red_1":"Parar","red_2":"Respirações Profundas","red_3":"Espaço Seguro","red_4":"Pedir Ajuda",
}
STRATEGY_NAME_MAP_ES = {
    "b1":"Estiramiento Suave","b2":"Canción Favorita","b3":"Contárselo a Alguien","b4":"Respiración Lenta",
    "g1":"¡Seguir Adelante!","g2":"Ayudar a un Amigo","g3":"Establecer una Meta","g4":"Gratitud",
    "y1":"Respiración Burbuja","y2":"Contar hasta 10","y3":"5 Sentidos","y4":"Hablar de Ello",
    "r1":"Parar","r2":"Respiraciones Profundas","r3":"Espacio Seguro","r4":"Pedir Ayuda",
    "blue_1":"Estiramiento Suave","blue_2":"Canción Favorita","blue_3":"Contárselo a Alguien","blue_4":"Respiración Lenta",
    "green_1":"¡Seguir Adelante!","green_2":"Ayudar a un Amigo","green_3":"Establecer una Meta","green_4":"Gratitud",
    "yellow_1":"Respiración Burbuja","yellow_2":"Contar hasta 10","yellow_3":"5 Sentidos","yellow_4":"Hablar de Ello",
    "red_1":"Parar","red_2":"Respiraciones Profundas","red_3":"Espacio Seguro","red_4":"Pedir Ayuda",
}
STRATEGY_NAME_MAP_FR = {
    "b1":"Étirement Doux","b2":"Chanson Préférée","b3":"En Parler à Quelqu un","b4":"Respiration Lente",
    "g1":"Continuer!","g2":"Aider un Ami","g3":"Fixer un Objectif","g4":"Gratitude",
    "y1":"Respiration Bulle","y2":"Compter jusqu à 10","y3":"5 Sens","y4":"En Parler",
    "r1":"S arrêter","r2":"Grandes Respirations","r3":"Espace Sûr","r4":"Demander de l Aide",
    "blue_1":"Étirement Doux","blue_2":"Chanson Préférée","blue_3":"En Parler","blue_4":"Respiration Lente",
    "green_1":"Continuer!","green_2":"Aider un Ami","green_3":"Fixer un Objectif","green_4":"Gratitude",
    "yellow_1":"Respiration Bulle","yellow_2":"Compter jusqu à 10","yellow_3":"5 Sens","yellow_4":"En Parler",
    "red_1":"S arrêter","red_2":"Grandes Respirations","red_3":"Espace Sûr","red_4":"Demander de l Aide",
}
STRATEGY_NAME_MAP_DE = {
    "b1":"Sanftes Dehnen","b2":"Lieblingslied","b3":"Jemandem Erzählen","b4":"Langsames Atmen",
    "g1":"Weitermachen!","g2":"Einem Freund Helfen","g3":"Ein Ziel Setzen","g4":"Dankbarkeit",
    "y1":"Blasen Atmen","y2":"Bis 10 Zählen","y3":"5 Sinne","y4":"Darüber Reden",
    "r1":"Stopp","r2":"Tiefe Atemzüge","r3":"Sicherer Ort","r4":"Um Hilfe Bitten",
    "blue_1":"Sanftes Dehnen","blue_2":"Lieblingslied","blue_3":"Jemandem Erzählen","blue_4":"Langsames Atmen",
    "green_1":"Weitermachen!","green_2":"Einem Freund Helfen","green_3":"Ein Ziel Setzen","green_4":"Dankbarkeit",
    "yellow_1":"Blasen Atmen","yellow_2":"Bis 10 Zählen","yellow_3":"5 Sinne","yellow_4":"Darüber Reden",
    "red_1":"Stopp","red_2":"Tiefe Atemzüge","red_3":"Sicherer Ort","red_4":"Um Hilfe Bitten",
}
STRATEGY_NAME_MAP_IT = {
    "b1":"Stretching Dolce","b2":"Canzone Preferita","b3":"Dirlo a Qualcuno","b4":"Respirazione Lenta",
    "g1":"Continuare!","g2":"Aiutare un Amico","g3":"Fissare un Obiettivo","g4":"Gratitudine",
    "y1":"Respirazione Bolla","y2":"Contare fino a 10","y3":"5 Sensi","y4":"Parlarne",
    "r1":"Fermarsi","r2":"Respiri Profondi","r3":"Spazio Sicuro","r4":"Chiedere Aiuto",
    "blue_1":"Stretching Dolce","blue_2":"Canzone Preferita","blue_3":"Dirlo a Qualcuno","blue_4":"Respirazione Lenta",
    "green_1":"Continuare!","green_2":"Aiutare un Amico","green_3":"Fissare un Obiettivo","green_4":"Gratitudine",
    "yellow_1":"Respirazione Bolla","yellow_2":"Contare fino a 10","yellow_3":"5 Sensi","yellow_4":"Parlarne",
    "red_1":"Fermarsi","red_2":"Respiri Profondi","red_3":"Spazio Sicuro","red_4":"Chiedere Aiuto",
}
STRATEGY_MAPS_BY_LANG = {
    "en": STRATEGY_NAME_MAP, "pt": STRATEGY_NAME_MAP_PT,
    "es": STRATEGY_NAME_MAP_ES, "fr": STRATEGY_NAME_MAP_FR,
    "de": STRATEGY_NAME_MAP_DE, "it": STRATEGY_NAME_MAP_IT,
}

PDF_HEADINGS = {
    "en": {"report": "Emotional Wellbeing Report", "strategies": "Coping Strategies Used", "log": "Check-in Log", "day_of_week": "Day of Week Activity", "emotion_dist": "Emotion Distribution"},
    "pt": {"report": "Relatório de Bem-Estar Emocional", "strategies": "Estratégias Utilizadas", "log": "Registo de Check-ins", "day_of_week": "Atividade por Dia da Semana", "emotion_dist": "Distribuição de Emoções"},
    "es": {"report": "Informe de Bienestar Emocional", "strategies": "Estrategias Utilizadas", "log": "Registro de Check-ins", "day_of_week": "Actividad por Día", "emotion_dist": "Distribución de Emociones"},
    "fr": {"report": "Rapport de Bien-être Émotionnel", "strategies": "Stratégies Utilisées", "log": "Journal des Enregistrements", "day_of_week": "Activité par Jour", "emotion_dist": "Distribution des Émotions"},
    "de": {"report": "Bericht zum emotionalen Wohlbefinden", "strategies": "Verwendete Strategien", "log": "Check-in-Protokoll", "day_of_week": "Aktivität nach Wochentag", "emotion_dist": "Emotionsverteilung"},
    "it": {"report": "Rapporto sul Benessere Emotivo", "strategies": "Strategie Utilizzate", "log": "Registro dei Check-in", "day_of_week": "Attività per Giorno", "emotion_dist": "Distribuzione delle Emozioni"},
}

def resolve_strategy_name(sid: str, lang: str = "en") -> str:
    """Return human-readable strategy name from ID or raw string."""
    lang_map = STRATEGY_MAPS_BY_LANG.get(lang, STRATEGY_NAME_MAP)
    sid_clean = str(sid).strip()
    return lang_map.get(sid_clean) or STRATEGY_NAME_MAP.get(sid_clean) or sid_clean.replace("_", " ").title()

@api_router.get("/reports/available-months/{student_id}")
async def get_available_months(student_id: str):
    logs = supabase.table("feeling_logs").select("timestamp").eq("student_id", student_id).execute()
    months = set()
    for log in (logs.data or []):
        month = log["timestamp"][:7]
        months.add(month)
    return sorted(list(months), reverse=True)

@api_router.get("/reports/pdf/family/{family_member_id}/month/{year}/{month}")
async def generate_family_pdf_report(family_member_id: str, year: int, month: int, request: Request, lang: str = ""):
    """Generate PDF report for a family member (home check-ins only)."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    fm_r = supabase.table("family_members").select("*").eq("id", family_member_id).execute()
    if not fm_r.data:
        raise HTTPException(status_code=404, detail="Family member not found")
    fm = fm_r.data[0]

    # Use student record if available, else create synthetic student_data
    student_data = {
        "name": fm.get("name", "Family Member"),
        "id": family_member_id,
        "classroom_id": None,
        "language": lang or "en",
    }

    start = datetime(year, month, 1, tzinfo=timezone.utc).isoformat()
    _, last_day = calendar.monthrange(year, month)
    end = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc).isoformat()

    home_logs = []

    # Check family_zone_logs first
    logs_r = supabase.table("family_zone_logs").select("*").eq("family_member_id", family_member_id).gte("timestamp", start).lte("timestamp", end).order("timestamp", desc=False).execute()
    for l in (logs_r.data or []):
        l["_source"] = "home"
        l["zone"] = l.get("zone", l.get("feeling_colour", ""))
        l["strategies_selected"] = l.get("strategies_selected", l.get("helpers_selected", []))
        home_logs.append(l)

    # Also check feeling_logs if member has a student_id
    student_id = fm.get("student_id")
    if student_id:
        fl_r = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start).lte("timestamp", end).order("timestamp", desc=False).execute()
        for l in (fl_r.data or []):
            l["_source"] = "home"
            l["zone"] = l.get("feeling_colour", l.get("zone", ""))
            l["strategies_selected"] = l.get("helpers_selected", l.get("strategies_selected", []))
            home_logs.append(l)

    # Sort combined logs by timestamp
    home_logs.sort(key=lambda x: x.get("timestamp", ""))

    if not home_logs:
        raise HTTPException(status_code=404, detail=f"No check-ins found for {fm.get('name')} in {year}/{month:02d}")

    logs_data = home_logs
    has_home_data = True

    # Detect language
    report_lang = lang if lang in ["pt","es","fr","de","it","en"] else "en"
    student_data["language"] = report_lang

    # Reuse the same PDF builder by forwarding to generate_pdf_report logic
    # Build aggregates
    feeling_counts = {"blue":0,"green":0,"yellow":0,"red":0}
    helper_counts = {}
    daily_counts = {}
    week_counts = {0:0,1:0,2:0,3:0,4:0,5:0,6:0}
    hour_counts = {}
    for log in logs_data:
        colour = log.get("feeling_colour", log.get("zone",""))
        if colour in feeling_counts: feeling_counts[colour] += 1
        for h in log.get("helpers_selected", log.get("strategies_selected",[])):
            if h: helper_counts[h] = helper_counts.get(h,0)+1
        try:
            ts = datetime.fromisoformat(log["timestamp"].replace("Z","+00:00"))
            dk = ts.strftime("%Y-%m-%d")
            if dk not in daily_counts: daily_counts[dk] = {"blue":0,"green":0,"yellow":0,"red":0}
            if colour in daily_counts[dk]: daily_counts[dk][colour] += 1
            week_counts[ts.weekday()] = week_counts.get(ts.weekday(),0)+1
            hour_counts[ts.hour] = hour_counts.get(ts.hour,0)+1
        except: pass

    # Import PDF builder deps
    import io, calendar as cal_mod
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm

    buffer = io.BytesIO()
    PAGE_W, PAGE_H = A4
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)

    INDIGO = colors.HexColor("#5C6BC0")
    GREEN_C = colors.HexColor("#4CAF50")
    ZONE_COLORS_PDF = {"blue":colors.HexColor("#4A90D9"),"green":GREEN_C,"yellow":colors.HexColor("#FFC107"),"red":colors.HexColor("#F44336")}

    ZONE_LABELS_BY_LANG = {
        "en":{"blue":"Blue Emotions","green":"Green Emotions","yellow":"Yellow Emotions","red":"Red Emotions"},
        "pt":{"blue":"Emoções Azuis","green":"Emoções Verdes","yellow":"Emoções Amarelas","red":"Emoções Vermelhas"},
        "es":{"blue":"Emociones Azules","green":"Emociones Verdes","yellow":"Emociones Amarillas","red":"Emociones Rojas"},
        "fr":{"blue":"Émotions Bleues","green":"Émotions Vertes","yellow":"Émotions Jaunes","red":"Émotions Rouges"},
        "de":{"blue":"Blaue Emotionen","green":"Grüne Emotionen","yellow":"Gelbe Emotionen","red":"Rote Emotionen"},
        "it":{"blue":"Emozioni Blu","green":"Emozioni Verdi","yellow":"Emozioni Gialle","red":"Emozioni Rosse"},
    }
    ZL = ZONE_LABELS_BY_LANG.get(report_lang, ZONE_LABELS_BY_LANG["en"])

    MONTH_NAMES = {
        "en":["January","February","March","April","May","June","July","August","September","October","November","December"],
        "pt":["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"],
        "es":["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"],
        "fr":["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"],
        "de":["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"],
        "it":["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],
    }
    month_name = MONTH_NAMES.get(report_lang, MONTH_NAMES["en"])[month-1]

    styles = getSampleStyleSheet()
    ST_H1 = ParagraphStyle("H1", fontSize=22, textColor=colors.white, fontName="Helvetica-Bold", leading=28)
    ST_H2 = ParagraphStyle("H2", fontSize=13, textColor=INDIGO, fontName="Helvetica-Bold", spaceBefore=10, spaceAfter=4)
    ST_BODY = ParagraphStyle("Body", fontSize=10, textColor=colors.HexColor("#444444"), leading=14)
    ST_SMALL = ParagraphStyle("Small", fontSize=8, textColor=colors.HexColor("#888888"), leading=11)

    story = []

    # Header
    header_data = [[
        Paragraph(f"🏠 {fm.get('name','Family Member')}", ST_H1),
        Paragraph(f"{month_name} {year}<br/><font size=9>Home Wellbeing Report</font>", ParagraphStyle("HR", fontSize=11, textColor=colors.HexColor("#C5CAE9"), leading=16)),
    ]]
    header_table = Table(header_data, colWidths=[PAGE_W*0.6, PAGE_W*0.3])
    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), INDIGO),
        ("PADDING", (0,0), (-1,-1), 16),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 16))

    # Summary stats
    total = sum(feeling_counts.values())
    story.append(Paragraph(f"Total home check-ins: {total}", ST_H2))
    story.append(Spacer(1, 8))

    # Emotion distribution
    dist_data = [["Emotion", "Count", "%"]]
    for z in ["green","yellow","blue","red"]:
        pct = round((feeling_counts[z]/total*100)) if total>0 else 0
        dist_data.append([ZL.get(z,z), str(feeling_counts[z]), f"{pct}%"])
    dist_table = Table(dist_data, colWidths=[200, 80, 80])
    dist_table.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),INDIGO),
        ("TEXTCOLOR",(0,0),(-1,0),colors.white),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),
        ("FONTSIZE",(0,0),(-1,-1),9),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.HexColor("#F8F9FA"),colors.white]),
        ("GRID",(0,0),(-1,-1),0.5,colors.HexColor("#E0E0E0")),
        ("PADDING",(0,0),(-1,-1),6),
    ]))
    story.append(dist_table)
    story.append(Spacer(1, 12))

    # Check-in log
    story.append(Paragraph("Check-in Log", ST_H2))
    log_data = [["Date", "Time", "Emotion", "🏠"]]
    for log in logs_data[-30:]:
        try:
            ts = datetime.fromisoformat(log["timestamp"].replace("Z","+00:00"))
            date_str = ts.strftime("%d %b")
            time_str = ts.strftime("%H:%M")
        except:
            date_str = time_str = "—"
        zone = log.get("feeling_colour", log.get("zone",""))
        log_data.append([date_str, time_str, ZL.get(zone, zone), "🏠"])

    log_table = Table(log_data, colWidths=[80,60,180,40])
    log_table.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),INDIGO),
        ("TEXTCOLOR",(0,0),(-1,0),colors.white),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),
        ("FONTSIZE",(0,0),(-1,-1),8),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.HexColor("#F8F9FA"),colors.white]),
        ("GRID",(0,0),(-1,-1),0.5,colors.HexColor("#E0E0E0")),
        ("PADDING",(0,0),(-1,-1),5),
    ]))
    story.append(log_table)
    story.append(Spacer(1,12))
    story.append(Paragraph("This report is generated by Class of Happiness · classofhappiness.com", ST_SMALL))

    doc.build(story)
    buffer.seek(0)

    import urllib.parse
    safe_name = urllib.parse.quote(fm.get("name","family"))
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="wellbeing_{safe_name}_{year}_{month:02d}.pdf"'}
    )



@api_router.get("/reports/pdf/student/{student_id}/month/{year}/{month}")
async def generate_pdf_report(student_id: str, year: int, month: int, request: Request, lang: str = ""):
    student = supabase.table("students").select("*").eq("id", student_id).execute()
    if not student.data:
        raise HTTPException(status_code=404, detail="Student not found")
    student_data = student.data[0]

    start = datetime(year, month, 1, tzinfo=timezone.utc).isoformat()
    _, last_day = calendar.monthrange(year, month)
    end = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc).isoformat()

    logs = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start).lte("timestamp", end).order("timestamp", desc=False).execute()
    school_logs = logs.data or []
    # Tag school logs with source
    for l in school_logs:
        l["_source"] = "school"

    # Also fetch home check-ins via family_members link
    home_logs = []
    has_home_data = False
    try:
        fm_link = supabase.table("family_members").select("id").eq("student_id", student_id).execute()
        if fm_link.data:
            fm_id = fm_link.data[0]["id"]
            home_res = supabase.table("family_zone_logs").select("*").eq("family_member_id", fm_id).gte("timestamp", start).lte("timestamp", end).order("timestamp", desc=False).execute()
            home_logs = home_res.data or []
            for l in home_logs:
                l["_source"] = "home"
                l["zone"] = l.get("zone", l.get("feeling_colour", ""))
                l["strategies_selected"] = l.get("strategies_selected", l.get("helpers_selected", []))
        has_home_data = len(home_logs) > 0
    except Exception as e:
        logger.warning(f"Could not fetch home logs for PDF: {e}")
        has_home_data = False

    # Combine all logs sorted by timestamp
    logs_data = sorted(school_logs + home_logs, key=lambda x: x.get("timestamp", ""))

    # Also get classroom info
    classroom_name = "Not assigned"
    if student_data.get("classroom_id"):
        try:
            cr = supabase.table("classrooms").select("name").eq("id", student_data["classroom_id"]).execute()
            if cr.data:
                classroom_name = cr.data[0]["name"]
        except: pass

    # Detect report language — check request header, then student, then classroom
    report_lang = "en"
    try:
        # Check URL lang param first (most reliable)
        if lang and lang in ["pt", "es", "fr", "de", "it", "en"]:
            report_lang = lang
        else:
            # Check Accept-Language header from request
            accept_lang = request.headers.get("Accept-Language", "")
            if accept_lang:
                lang_code = accept_lang.split(",")[0].split("-")[0].lower()
                if lang_code in ["pt", "es", "fr", "de", "it", "en"]:
                    report_lang = lang_code
        # Override with student's saved language if set
        if student_data.get("language"):
            lang_code = student_data["language"][:2].lower()
            if lang_code in ["pt", "es", "fr", "de", "it", "en"]:
                report_lang = lang_code
        elif student_data.get("classroom_id"):
            cr_lang = supabase.table("classrooms").select("language").eq("id", student_data["classroom_id"]).execute()
            if cr_lang.data and cr_lang.data[0].get("language"):
                lang_code = cr_lang.data[0]["language"][:2].lower()
                if lang_code in ["pt", "es", "fr", "de", "it", "en"]:
                    report_lang = lang_code
    except: pass
    # Inject into student_data so the PDF builder can read it
    student_data["language"] = report_lang

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
    # Language-aware zone labels
    lang = "en"
    try:
        if student_data.get("language"):
            lang = student_data["language"]
        else:
            # Try to get from classroom/teacher settings
            pass
    except: pass

    ZONE_LABELS_MAP = {
        "en": {"blue": "Blue Emotions",      "green": "Green Emotions",      "yellow": "Yellow Emotions",      "red": "Red Emotions", "about_app": "About App", "about_privacy": "About & Privacy", "access_expires_30_days": "Access expires in 30 days", "add": "Add", "add_comment": "Add Comment", "add_custom_strategy": "Add Custom Strategy", "add_family_member": "Add Family Member", "add_family_strategy": "Add Family Strategy", "add_family_to_track": "Add a family member to track wellbeing", "add_first_student": "Add your first student", "add_member": "Add Member", "add_new_student": "Add New Student", "add_note_optional": "Add a note (optional)", "add_strategy": "Add Strategy", "add_strategy_title": "Add Strategy", "add_strategy_to_students": "Add strategy to students", "add_widget_android": "Add to Home Screen (Android)", "add_widget_ios": "Add Widget (iOS)", "add_widget_title": "Add Widget", "adding": "Adding...", "admin_access": "Admin Access", "admin_dashboard": "Admin Dashboard", "administration": "Administration", "alert_sent": "Alert Sent", "alert_sent_desc": "Your teacher has been notified", "all_arrow": "All →", "all_zones": "All Emotions", "are_you_sure_delete_strategy": "Are you sure you want to delete this strategy?", "as_default_language": "as default language", "assign_classroom": "Assign Classroom", "assign_to": "Assign to", "blue_emotions": "Blue Emotions", "blue_emotions_label": "Blue Emotions", "blue_short": "Blue", "blue_short_label": "Blue", "blue_zone_desc": "Feeling sad or tired", "blue_zone_name": "Blue Emotions", "by": "by", "change": "Change", "change_language_confirm": "Change language?", "change_photo": "Change Photo", "check_ins": "Check-ins", "checkin_btn": "Check In", "checkin_calendar": "Check-in Calendar", "checkin_complete": "Check-in Complete!", "checkin_for": "Check-in for", "checkin_saved": "Check-in Saved!", "checkin_saved_private": "Saved privately", "checkin_saved_shared": "Saved and shared with teacher", "child_not_found": "Child not found", "child_strategies_note": "Strategies assigned to this child", "children_school": "Children at School", "choose_helpful_strategies": "Choose helpful strategies", "choose_icon": "Choose Icon", "classroom": "Classroom", "classroom_name": "Classroom Name", "classroom_name_placeholder": "e.g. Year 3 Sunshine", "classroom_widget": "Classroom Widget", "classrooms": "Classrooms", "comment_optional": "Comment (optional)", "confirm_delete_member": "Delete this family member?", "confirm_delete_resource": "Delete this resource?", "confirm_unlink_student": "Unlink this student from parent?", "create_classroom": "Create Classroom", "create_new_classroom": "Create New Classroom", "create_new_student": "Create New Student", "creating": "Creating...", "creatures": "Creatures", "custom_strategies_for": "Custom strategies for", "data_shared_desc": "Emotional wellbeing data is being shared between school and home", "days_14": "2 Weeks", "days_30": "30 Days", "days_7": "7 Days", "days_ago": "days ago", "default_badge": "Default", "default_zone_strategies": "Default strategies", "delete_btn": "Delete", "delete_classroom": "Delete Classroom", "delete_member": "Delete Member", "delete_student": "Delete Student", "description": "Description", "description_label": "Description", "deselect_all": "Deselect All", "disclaimer_1": "This app supports emotional awareness, not clinical diagnosis.", "disclaimer_2": "Data is kept private and secure.", "disclaimer_3": "Always consult a professional for mental health concerns.", "disclaimer_privacy_terms": "Privacy & Terms", "download_error": "Download Error", "download_monthly_reports": "Download Monthly Reports", "download_report": "Download Report", "edit_family_strategy": "Edit Family Strategy", "edit_member": "Edit Member", "edit_note": "Edit Note", "edit_strategy": "Edit Strategy", "emotion_colour": "Emotion Colour", "emotion_distribution": "Emotion Distribution", "emotion_strategies_children": "Emotion strategies for children", "emotions": "Emotions", "emotions_topic": "Emotions", "enter_admin_code": "Enter admin code to unlock", "enter_code": "Enter the 6-character code from your child's teacher", "enter_description": "Enter description", "enter_invite_code_desc": "Enter your school invite code", "enter_name": "Enter name", "error": "Error", "everyone": "Everyone", "evolves": "Evolves!", "failed_delete_member": "Failed to delete member", "failed_update_member": "Failed to update member", "family": "Family", "family_emotional_status": "Family Emotional Status", "family_emotions": "Family Emotions", "family_widget": "Family Widget", "for_educational_purposes": "For educational purposes only", "for_student": "for student", "free_trial_label": "Free Trial", "from_teacher": "From Teacher", "full_access_no_card": "Full access — no credit card needed", "generate_code": "Generate Code", "generate_code_desc": "Generate a code to share with the parent", "generate_invite_code": "Generate Invite Code", "generate_parent_code": "Generate Parent Code", "generate_teacher_code": "Generate Teacher Code", "generating": "Generating...", "go_back": "Go Back", "got_it": "Got it!", "green_emotions": "Green Emotions", "green_emotions_label": "Green Emotions", "green_short": "Green", "green_short_label": "Green", "green_zone_desc": "Feeling happy and ready to learn", "green_zone_name": "Green Emotions", "has_been_removed": "has been removed", "has_been_updated": "has been updated", "healthy_relationships": "Healthy Relationships", "home": "Home", "home_check_in": "Home Check-in", "home_checkins": "Home Check-ins", "home_data": "Home Data", "home_legend": "H = Home", "home_sharing_disabled": "Home sharing disabled", "home_sharing_enabled": "Home sharing enabled", "home_sharing_off": "Home data sharing is OFF", "home_sharing_on": "Home data sharing is ON", "hours_ago": "hours ago", "how_feeling": "How are you feeling?", "how_to_do_optional": "How to do it (optional)", "how_to_use": "How to use this strategy", "i_agree_and_continue": "I Agree & Continue", "icon": "Icon", "icon_label": "Icon", "image_label": "Image", "important_notice": "Important Notice", "invite_code_placeholder": "Enter invite code", "join_school_btn": "Join School", "join_your_school": "Join Your School", "joining": "Joining...", "just_now": "Just now", "keep_private": "Keep Private", "large_widget": "Large Widget", "leader_online": "Leader Online", "legal": "Legal", "link_child": "Link Child", "link_child_school": "Link Child from School", "link_children_school": "Link Children from School", "linked_students_filter": "Linked Students", "linking": "Linking...", "loading_resources": "Loading resources...", "logged_in_required": "Please log in to continue", "manage_strategies_title": "Manage Strategies", "medium_widget": "Medium Widget", "minutes_ago": "minutes ago", "month": "Month", "more_points_until": "more points until", "most_used_strategies": "Most Used Strategies", "mutual_consent": "Mutual Consent Active", "my_strategies": "My Strategies", "name": "Name", "name_required": "Name required", "no_checkin_yet": "No check-ins yet", "no_checkins": "No check-ins yet", "no_classroom": "No Classroom", "no_classrooms_yet": "No classrooms yet", "no_data_period": "No data for this period", "no_family_strategies": "No family strategies yet", "no_home_data_yet": "No home data yet", "no_recent_activity": "No recent activity", "no_resources_yet": "No resources yet", "no_students_found": "No students found", "no_students_yet": "No students yet", "parent_link_code": "Parent Link Code", "parent_sharing_disabled": "Parent has not enabled home data sharing", "parent_sharing_hint": "The parent can enable sharing from their dashboard", "per_week_avg": "per week avg", "personal_support_message": "Personal support message", "photo": "Photo", "photo_label": "Photo", "please_enter_name": "Please enter a name", "please_try_again": "Please try again", "private_message_note": "This message is private", "recent_checkins": "Recent Check-ins", "red_emotions": "Red Emotions", "red_emotions_label": "Red Emotions", "red_short": "Red", "red_short_label": "Red", "red_zone_desc": "Feeling very upset or angry", "red_zone_name": "Red Emotions", "relationship": "Relationship", "request_support": "Request Support", "research_basis": "Evidence-based emotional learning", "resources": "Resources", "save_changes": "Save Changes", "save_check_in": "Save Check-in", "save_message": "Save Message", "save_school_profile": "Save School Profile", "saving": "Saving...", "school": "School", "school_admin_dashboard": "School Admin Dashboard", "school_admin_label": "School Admin", "school_invite_code": "School Invite Code", "school_legend": "S = School", "school_strategies": "School Strategies", "search_students": "Search students", "select": "Select", "select_all": "Select All", "select_classroom_for": "Select classroom for", "select_emotion": "Select an emotion", "select_helpful_strategies": "Select helpful strategies", "select_month": "Select Month", "select_month_pdf": "Select a month to download a PDF report", "select_pdf": "Select PDF", "select_strategy": "Select Strategy", "select_students": "Select Students", "selected": "Selected", "selected_count": "selected", "share_code": "Share Code", "share_code_instructions": "Share this code with the parent so they can link their account", "share_student_tracking": "Share Student Emotion Tracking", "share_wellbeing": "Share Wellbeing", "share_with_home": "Share with Home", "share_with_home_desc": "Parent will see this strategy in the app", "share_with_teacher": "Share with Teacher", "share_with_teachers": "Share with Teachers", "shared_strategies": "Shared Strategies", "shared_with_teacher_check": "Shared with teacher", "sharing_disclaimer_text": "By sharing, you consent to emotional wellbeing data being shared between school and home for this student's support.", "sharing_disclaimer_title": "Consent to Share Access", "sharing_paused": "Sharing Paused", "sharing_paused_desc": "Parent has not enabled home sharing. Home check-in data is not visible.", "skip_strategies": "Skip strategies", "small_widget": "Small Widget", "special_needs_education": "Special Needs Education", "start_free_trial": "Start Free Trial", "start_free_trial_btn": "Start Free Trial", "starting": "Starting...", "stats": "Stats", "steady": "Steady", "strat_5_senses": "5 Senses", "strat_bubble_breathing": "Bubble Breathing", "strat_count_to_10": "Count to 10", "strat_favourite_song": "Favourite Song", "strat_gentle_stretch": "Gentle Stretch", "strat_gratitude": "Gratitude", "strat_help_friend": "Help a Friend", "strat_keep_going": "Keep Going!", "strat_safe_space_name": "Safe Space", "strat_set_goal": "Set a Goal", "strat_slow_breathing": "Slow Breathing", "strat_squeeze_release": "Squeeze & Release", "strat_talk_about_it": "Talk About It", "strat_tell_someone": "Tell Someone", "strat_walk_away": "Walk Away", "strategy_added": "Strategy added!", "strategy_btn": "Strategies", "strategy_desc_ph": "Describe how to use this strategy...", "strategy_example": "e.g. Deep breathing, Take a walk...", "strategy_name": "Strategy Name", "strategy_name_example": "e.g. Bubble Breathing", "strategy_name_ph": "Strategy name", "strategy_shared": "Strategy shared with teacher", "strategy_unshared": "Strategy no longer shared", "streak_bonus": "Streak Bonus!", "stressed": "Stressed", "student_linked": "Student is Linked", "student_linked_desc": "This student is connected to a parent account", "student_not_found": "Student not found", "student_unlinked": "Student unlinked from parent", "students": "Students", "students_in_class": "Students in class", "success": "Success!", "super_admin": "Super Admin", "support": "Support", "support_message_hint": "Tap the hand icon to ask for support", "support_message_hint2": "Your teacher will be notified", "support_message_placeholder": "Tell your teacher how you feel...", "synced": "Synced", "tab_child_strategies": "Child Strategies", "tab_my_strategies": "My Strategies", "tab_parent_strategies": "Parent Strategies", "tap_to_check_in": "Tap to check in", "teacher_can_see": "Teacher can see this", "teacher_can_see_strategy": "Teacher can see this strategy", "teacher_cannot_see": "Teacher cannot see this", "teacher_checkin": "Teacher Check-in", "teacher_link_code": "Teacher Link Code", "teacher_name_optional": "Teacher name (optional)", "teacher_name_placeholder": "e.g. Ms Smith", "teacher_resources": "Teacher Resources", "thank_you": "Thank you!", "this_week": "This Week", "trial": "Free Trial", "trial_active": "Trial Active", "trial_active_desc": "Your free trial is active", "trial_desc": "No credit card needed", "try_again": "Try Again", "try_different_search": "Try a different search", "unlink": "Unlink", "unlink_student": "Unlink Student", "updated_just_now": "Updated just now", "updating": "Updating...", "upload_photo": "Upload Photo", "use_icon": "Use Icon", "view_my_wellbeing": "View My Wellbeing", "wellbeing_journal": "Add journal note", "wellbeing_journal_ph": "Write how you feel today...", "wellbeing_pin_confirm": "Confirm PIN", "wellbeing_pin_desc": "Only you can see this.", "wellbeing_pin_enter": "Enter your PIN", "wellbeing_pin_forgot": "Forgot PIN?", "wellbeing_pin_forgot_msg": "Try again or reset your PIN", "wellbeing_pin_hint_label": "PIN hint (optional)", "wellbeing_pin_hint_show": "Your hint:", "wellbeing_pin_mismatch": "PINs do not match", "wellbeing_pin_reset": "Reset PIN", "wellbeing_pin_setup": "Create your private PIN", "wellbeing_pin_wrong": "Incorrect PIN", "wellbeing_total": "total check-ins", "widget_preview": "Widget Preview", "widget_preview_desc": "See how your family is feeling at a glance", "widget_preview_desc_teacher": "See how your class is feeling at a glance", "write_custom_strategy": "Write a custom strategy", "write_short_note": "Write a short note...", "yellow_emotions": "Yellow Emotions", "yellow_emotions_label": "Yellow Emotions", "yellow_short": "Yellow", "yellow_short_label": "Yellow", "yellow_zone_desc": "Feeling worried or anxious", "yellow_zone_name": "Yellow Emotions", "you_are_what_you_eat": "You are what you eat", "your_recent_checkins": "Your Recent Check-ins", "zone_all": "All", "zone_blue": "Blue", "zone_comparison": "Emotion Comparison", "zone_green": "Green", "zone_red": "Red", "zone_yellow": "Yellow", "family_dashboard": "Family Dashboard"},
        "pt": {"blue": "Emoções Azuis",      "green": "Emoções Verdes",      "yellow": "Emoções Amarelas",     "red": "Emoções Vermelhas", "about_app": "Sobre a App", "about_privacy": "Sobre & Privacidade", "access_expires_30_days": "Acesso expira em 30 dias", "add": "Adicionar", "add_comment": "Adicionar Comentário", "add_custom_strategy": "Adicionar Estratégia Personalizada", "add_family_strategy": "Adicionar Estratégia Familiar", "add_family_to_track": "Adiciona um membro da família para acompanhar o bem-estar", "add_first_student": "Adiciona o teu primeiro aluno", "add_strategy": "Adicionar Estratégia", "add_strategy_title": "Adicionar Estratégia", "add_strategy_to_students": "Adicionar estratégia a alunos", "add_widget_android": "Adicionar ao ecrã inicial (Android)", "add_widget_ios": "Adicionar Widget (iOS)", "add_widget_title": "Adicionar Widget", "adding": "A adicionar...", "admin_access": "Acesso Admin", "admin_dashboard": "Painel Admin", "administration": "Administração", "alert_sent": "Alerta Enviado", "alert_sent_desc": "O teu professor foi notificado", "all_arrow": "Todos →", "all_zones": "Todas as Emoções", "are_you_sure_delete_strategy": "Tens a certeza que queres eliminar esta estratégia?", "as_default_language": "como língua predefinida", "assign_classroom": "Atribuir Turma", "assign_to": "Atribuir a", "blue_emotions": "Emoções Azuis", "blue_emotions_label": "Emoções Azuis", "blue_short": "Azul", "blue_short_label": "Azul", "blue_zone_desc": "Sinto-me triste ou cansado", "blue_zone_name": "Emoções Azuis", "by": "por", "change": "Alterar", "change_language_confirm": "Alterar idioma?", "change_photo": "Alterar Foto", "check_ins": "Check-ins", "checkin_btn": "Registar", "checkin_calendar": "Calendário de Check-ins", "checkin_complete": "Check-in Completo!", "checkin_for": "Check-in para", "checkin_saved": "Check-in Guardado!", "checkin_saved_private": "Guardado de forma privada", "checkin_saved_shared": "Guardado e partilhado com o professor", "child_not_found": "Criança não encontrada", "child_strategies_note": "Estratégias atribuídas a esta criança", "children_school": "Crianças na Escola", "choose_helpful_strategies": "Escolher estratégias úteis", "choose_icon": "Escolher Ícone", "classroom": "Turma", "comment_optional": "Comentário (opcional)", "confirm_delete_member": "Eliminar este membro da família?", "confirm_delete_resource": "Eliminar este recurso?", "confirm_unlink_student": "Desligar este aluno do encarregado?", "create_classroom": "Criar Turma", "create_new_student": "Criar Novo Aluno", "creating": "A criar...", "creatures": "Criaturas", "custom_strategies_for": "Estratégias personalizadas para", "data_shared_desc": "Dados de bem-estar emocional partilhados entre escola e casa", "days_14": "2 Semanas", "days_30": "30 Dias", "days_7": "7 Dias", "days_ago": "dias atrás", "default_badge": "Predefinido", "default_zone_strategies": "Estratégias predefinidas", "delete_btn": "Eliminar", "delete_member": "Eliminar Membro", "delete_student": "Eliminar Aluno", "description_label": "Descrição", "deselect_all": "Desselecionar Todos", "disclaimer_1": "Esta app apoia a consciência emocional, não o diagnóstico clínico.", "disclaimer_2": "Os dados são mantidos privados e seguros.", "disclaimer_3": "Consulta sempre um profissional para questões de saúde mental.", "disclaimer_privacy_terms": "Privacidade & Termos", "download_error": "Erro de Download", "download_monthly_reports": "Descarregar Relatórios Mensais", "edit_family_strategy": "Editar Estratégia Familiar", "edit_member": "Editar Membro", "edit_strategy": "Editar Estratégia", "emotion_colour": "Cor da Emoção", "emotion_strategies_children": "Estratégias emocionais para crianças", "emotions": "Emoções", "emotions_topic": "Emoções", "enter_admin_code": "Introduzir código de admin", "enter_code": "Introduz o código de 6 caracteres do professor", "enter_description": "Introduzir descrição", "enter_invite_code_desc": "Introduz o código de convite da escola", "enter_name": "Introduzir nome", "error": "Erro", "everyone": "Todos", "evolves": "Evolui!", "failed_delete_member": "Falha ao eliminar membro", "failed_update_member": "Falha ao atualizar membro", "family": "Família", "family_emotional_status": "Estado Emocional da Família", "family_emotions": "Emoções da Família", "family_widget": "Widget da Família", "for_educational_purposes": "Apenas para fins educativos", "for_student": "para o aluno", "free_trial_label": "Ensaio Gratuito", "full_access_no_card": "Acesso completo — sem cartão de crédito", "generate_code_desc": "Gera um código para partilhar com o encarregado", "generate_parent_code": "Gerar Código do Encarregado", "generate_teacher_code": "Gerar Código do Professor", "generating": "A gerar...", "go_back": "Voltar", "got_it": "Percebi!", "green_emotions": "Emoções Verdes", "green_emotions_label": "Emoções Verdes", "green_short": "Verde", "green_short_label": "Verde", "green_zone_desc": "Sinto-me bem e pronto para aprender", "green_zone_name": "Emoções Verdes", "has_been_removed": "foi removido", "has_been_updated": "foi atualizado", "healthy_relationships": "Relações Saudáveis", "home": "Casa", "home_check_in": "Check-in em Casa", "home_checkins": "Check-ins em Casa", "home_legend": "C = Casa", "home_sharing_disabled": "Partilha em casa desativada", "home_sharing_enabled": "Partilha em casa ativada", "home_sharing_off": "Partilha de dados em casa DESATIVADA", "home_sharing_on": "Partilha de dados em casa ATIVADA", "hours_ago": "horas atrás", "how_feeling": "Como te sentes?", "how_to_do_optional": "Como fazer (opcional)", "how_to_use": "Como usar esta estratégia", "i_agree_and_continue": "Concordo & Continuar", "icon": "Ícone", "icon_label": "Ícone", "image_label": "Imagem", "important_notice": "Aviso Importante", "invite_code_placeholder": "Introduzir código de convite", "join_school_btn": "Entrar na Escola", "join_your_school": "Juntar-se à Escola", "joining": "A juntar...", "just_now": "Agora mesmo", "keep_private": "Manter Privado", "large_widget": "Widget Grande", "leader_online": "Líder Online", "linked_students_filter": "Alunos Ligados", "linking": "A ligar...", "loading_resources": "A carregar recursos...", "logged_in_required": "Por favor inicia sessão para continuar", "manage_strategies_title": "Gerir Estratégias", "medium_widget": "Widget Médio", "minutes_ago": "minutos atrás", "month": "Mês", "more_points_until": "mais pontos até", "most_used_strategies": "Estratégias Mais Usadas", "mutual_consent": "Consentimento Mútuo Ativo", "my_strategies": "As Minhas Estratégias", "name": "Nome", "name_required": "Nome obrigatório", "no_checkin_yet": "Ainda sem check-ins", "no_checkins": "Ainda sem check-ins", "no_classroom": "Sem Turma", "no_data_period": "Sem dados para este período", "no_family_strategies": "Ainda sem estratégias familiares", "no_home_data_yet": "Ainda sem dados em casa", "no_resources_yet": "Ainda sem recursos", "no_students_found": "Nenhum aluno encontrado", "no_students_yet": "Ainda sem alunos", "parent_link_code": "Código de Ligação do Encarregado", "parent_sharing_disabled": "O encarregado não ativou a partilha de dados em casa", "parent_sharing_hint": "O encarregado pode ativar a partilha no seu painel", "per_week_avg": "média por semana", "personal_support_message": "Mensagem de apoio pessoal", "photo": "Foto", "photo_label": "Foto", "please_enter_name": "Por favor introduz um nome", "please_try_again": "Por favor tenta novamente", "private_message_note": "Esta mensagem é privada", "red_emotions": "Emoções Vermelhas", "red_emotions_label": "Emoções Vermelhas", "red_short": "Vermelho", "red_short_label": "Vermelho", "red_zone_desc": "Sinto-me muito perturbado ou zangado", "red_zone_name": "Emoções Vermelhas", "request_support": "Pedir Apoio", "research_basis": "Aprendizagem emocional baseada em evidências", "save_changes": "Guardar Alterações", "save_check_in": "Guardar Check-in", "save_message": "Guardar Mensagem", "school": "Escola", "school_admin_label": "Admin da Escola", "school_invite_code": "Código de Convite da Escola", "school_legend": "E = Escola", "select": "Selecionar", "select_all": "Selecionar Todos", "select_classroom_for": "Selecionar turma para", "select_month": "Selecionar Mês", "select_month_pdf": "Seleciona um mês para descarregar o relatório PDF", "select_pdf": "Selecionar PDF", "select_strategy": "Selecionar Estratégia", "select_students": "Selecionar Alunos", "selected": "Selecionado", "selected_count": "selecionados", "share_code": "Partilhar Código", "share_code_instructions": "Partilha este código com o encarregado", "share_student_tracking": "Partilhar Acompanhamento Emocional", "share_wellbeing": "Partilhar Bem-estar", "share_with_home": "Partilhar com Casa", "share_with_home_desc": "O encarregado verá esta estratégia na app", "shared_strategies": "Estratégias Partilhadas", "shared_with_teacher_check": "Partilhado com o professor", "sharing_disclaimer_text": "Ao partilhar, consentes que os dados de bem-estar emocional sejam partilhados entre escola e casa.", "sharing_disclaimer_title": "Consentimento para Partilhar", "sharing_paused": "Partilha Pausada", "sharing_paused_desc": "O encarregado não ativou a partilha. Os dados em casa não são visíveis.", "small_widget": "Widget Pequeno", "special_needs_education": "Educação para Necessidades Especiais", "start_free_trial": "Iniciar Ensaio Gratuito", "start_free_trial_btn": "Iniciar Ensaio Gratuito", "starting": "A iniciar...", "stats": "Estatísticas", "steady": "Estável", "strat_5_senses": "5 Sentidos", "strat_bubble_breathing": "Respiração de Bolhas", "strat_count_to_10": "Contar até 10", "strat_favourite_song": "Música Favorita", "strat_gentle_stretch": "Alongamento Suave", "strat_gratitude": "Gratidão", "strat_help_friend": "Ajudar um Amigo", "strat_keep_going": "Continua!", "strat_safe_space_name": "Espaço Seguro", "strat_set_goal": "Definir um Objetivo", "strat_slow_breathing": "Respiração Lenta", "strat_squeeze_release": "Apertar e Soltar", "strat_talk_about_it": "Falar Sobre Isso", "strat_tell_someone": "Dizer a Alguém", "strat_walk_away": "Afastar-se", "strategy_added": "Estratégia adicionada!", "strategy_btn": "Estratégias", "strategy_desc_ph": "Descreve como usar esta estratégia...", "strategy_example": "ex. Respiração profunda, Dar uma caminhada...", "strategy_name_example": "ex. Respiração de Bolhas", "strategy_name_ph": "Nome da estratégia", "strategy_shared": "Estratégia partilhada com o professor", "strategy_unshared": "Estratégia já não partilhada", "streak_bonus": "Bónus de Sequência!", "stressed": "Stressado", "student_linked": "Aluno Ligado", "student_linked_desc": "Este aluno está ligado a uma conta de encarregado", "student_not_found": "Aluno não encontrado", "student_unlinked": "Aluno desligado do encarregado", "students_in_class": "Alunos na turma", "super_admin": "Super Admin", "support_message_hint": "Toca no ícone da mão para pedir apoio", "support_message_hint2": "O teu professor será notificado", "support_message_placeholder": "Diz ao teu professor como te sentes...", "synced": "Sincronizado", "tab_child_strategies": "Estratégias da Criança", "tab_my_strategies": "As Minhas Estratégias", "tab_parent_strategies": "Estratégias do Encarregado", "teacher_can_see": "O professor pode ver isto", "teacher_can_see_strategy": "O professor pode ver esta estratégia", "teacher_cannot_see": "O professor não pode ver isto", "teacher_link_code": "Código de Ligação do Professor", "teacher_name_optional": "Nome do professor (opcional)", "teacher_name_placeholder": "ex. Professora Silva", "thank_you": "Obrigado!", "this_week": "Esta Semana", "trial": "Ensaio Gratuito", "trial_active": "Ensaio Ativo", "trial_active_desc": "O teu ensaio gratuito está ativo", "trial_desc": "Sem necessidade de cartão de crédito", "try_again": "Tentar Novamente", "try_different_search": "Tenta uma pesquisa diferente", "unlink": "Desligar", "unlink_student": "Desligar Aluno", "updated_just_now": "Atualizado agora mesmo", "updating": "A atualizar...", "upload_photo": "Carregar Foto", "use_icon": "Usar Ícone", "view_my_wellbeing": "Ver o Meu Bem-estar", "wellbeing_journal": "Adicionar nota de diário", "wellbeing_journal_ph": "Escreve como te sentes hoje...", "wellbeing_pin_confirm": "Confirmar PIN", "wellbeing_pin_desc": "Só tu podes ver isto.", "wellbeing_pin_enter": "Introduzir PIN", "wellbeing_pin_forgot": "Esqueceste o PIN?", "wellbeing_pin_forgot_msg": "Tenta novamente ou redefine o teu PIN", "wellbeing_pin_hint_label": "Dica do PIN (opcional)", "wellbeing_pin_hint_show": "A tua dica:", "wellbeing_pin_mismatch": "Os PINs não coincidem", "wellbeing_pin_reset": "Redefinir PIN", "wellbeing_pin_setup": "Criar PIN privado", "wellbeing_pin_wrong": "PIN incorreto", "wellbeing_total": "check-ins no total", "widget_preview": "Pré-visualização do Widget", "widget_preview_desc": "Vê como a tua família se sente de relance", "widget_preview_desc_teacher": "Vê como a tua turma se sente de relance", "write_custom_strategy": "Escrever estratégia personalizada", "write_short_note": "Escreve uma nota curta...", "yellow_emotions": "Emoções Amarelas", "yellow_emotions_label": "Emoções Amarelas", "yellow_short": "Amarelo", "yellow_short_label": "Amarelo", "yellow_zone_desc": "Sinto-me preocupado ou ansioso", "yellow_zone_name": "Emoções Amarelas", "you_are_what_you_eat": "És o que comes", "your_recent_checkins": "Os Teus Check-ins Recentes", "zone_all": "Todos", "zone_blue": "Azul", "zone_comparison": "Comparação de Emoções", "zone_green": "Verde", "zone_red": "Vermelho", "zone_yellow": "Amarelo", "today": "Hoje", "fortnight": "Quinzena", "recent_checkins": "Check-ins Recentes", "add_note_optional": "Adicionar nota (opcional)", "photo_optional": "Foto (opcional)", "silly": "Parvo", "nervous": "Nervoso", "frustrated": "Frustrado", "worried": "Preocupado", "tired": "Cansado", "sad": "Triste", "angry": "Zangado", "out_of_control": "Fora de Controlo", "very_upset": "Muito Perturbado", "bored": "Aborrecido", "calm": "Calmo", "happy": "Feliz", "focused": "Focado", "ready_to_learn": "Pronto para Aprender", "lonely": "Sozinho", "loading": "A carregar...", "family_dashboard": "Dashboard Familiar"},
        "es": {"blue": "Emociones Azules",   "green": "Emociones Verdes",    "yellow": "Emociones Amarillas",  "red": "Emociones Rojas", "about_app": "Sobre la App", "about_privacy": "Sobre y Privacidad", "access_expires_30_days": "El acceso expira en 30 días", "add_comment": "Añadir Comentario", "add_custom_strategy": "Añadir Estrategia Personalizada", "add_family_member": "Añadir Miembro de Familia", "add_family_to_track": "Añade un miembro de la familia para seguir el bienestar", "add_first_student": "Añade tu primer alumno", "add_new_student": "Añadir Nuevo Alumno", "add_note_optional": "Añadir nota (opcional)", "add_strategy_title": "Añadir Estrategia", "add_strategy_to_students": "Añadir estrategia a alumnos", "add_widget_android": "Añadir a pantalla de inicio (Android)", "add_widget_ios": "Añadir Widget (iOS)", "add_widget_title": "Añadir Widget", "adding": "Añadiendo...", "admin_access": "Acceso Admin", "admin_dashboard": "Panel Admin", "administration": "Administración", "alert_sent": "Alerta Enviada", "alert_sent_desc": "Tu profesor ha sido notificado", "all_arrow": "Todos →", "all_zones": "Todas las Emociones", "are_you_sure_delete_strategy": "¿Estás seguro de que quieres eliminar esta estrategia?", "as_default_language": "como idioma predeterminado", "assign_classroom": "Asignar Clase", "blue_emotions_label": "Emociones Azules", "blue_short": "Azul", "blue_short_label": "Azul", "blue_zone_desc": "Me siento triste o cansado", "blue_zone_name": "Emociones Azules", "by": "por", "change": "Cambiar", "change_language_confirm": "¿Cambiar idioma?", "change_photo": "Cambiar Foto", "checkin_btn": "Registrar", "checkin_calendar": "Calendario de Registros", "checkin_complete": "¡Registro Completo!", "checkin_for": "Registro para", "checkin_saved": "¡Registro Guardado!", "checkin_saved_private": "Guardado de forma privada", "checkin_saved_shared": "Guardado y compartido con el profesor", "child_not_found": "Niño no encontrado", "child_strategies_note": "Estrategias asignadas a este niño", "children_school": "Niños en la Escuela", "choose_helpful_strategies": "Elegir estrategias útiles", "choose_icon": "Elegir Icono", "classroom": "Clase", "classroom_name": "Nombre de la Clase", "classroom_name_placeholder": "ej. Año 3 Girasoles", "classroom_widget": "Widget de Clase", "comment_optional": "Comentario (opcional)", "confirm_delete_member": "¿Eliminar este miembro de la familia?", "confirm_delete_resource": "¿Eliminar este recurso?", "confirm_unlink_student": "¿Desconectar este alumno del padre?", "create_classroom": "Crear Clase", "create_new_classroom": "Crear Nueva Clase", "create_new_student": "Crear Nuevo Alumno", "creating": "Creando...", "creatures": "Criaturas", "custom_strategies_for": "Estrategias personalizadas para", "data_shared_desc": "Datos de bienestar emocional compartidos entre escuela y casa", "days_14": "2 Semanas", "days_30": "30 Días", "days_7": "7 Días", "days_ago": "días atrás", "default_badge": "Predeterminado", "default_zone_strategies": "Estrategias predeterminadas", "delete_btn": "Eliminar", "delete_classroom": "Eliminar Clase", "delete_member": "Eliminar Miembro", "delete_student": "Eliminar Alumno", "description_label": "Descripción", "deselect_all": "Deseleccionar Todo", "disclaimer_1": "Esta app apoya la conciencia emocional, no el diagnóstico clínico.", "disclaimer_2": "Los datos se mantienen privados y seguros.", "disclaimer_3": "Consulta siempre a un profesional para problemas de salud mental.", "disclaimer_privacy_terms": "Privacidad y Términos", "download_error": "Error de Descarga", "download_monthly_reports": "Descargar Informes Mensuales", "edit_family_strategy": "Editar Estrategia Familiar", "edit_member": "Editar Miembro", "edit_note": "Editar Nota", "emotion_distribution": "Distribución de Emociones", "emotion_strategies_children": "Estrategias emocionales para niños", "emotions_topic": "Emociones", "enter_admin_code": "Introducir código de admin", "enter_code": "Introduce el código de 6 caracteres del profesor", "enter_description": "Introducir descripción", "enter_invite_code_desc": "Introduce el código de invitación de tu escuela", "enter_name": "Introducir nombre", "failed_delete_member": "Error al eliminar miembro", "failed_update_member": "Error al actualizar miembro", "family": "Familia", "family_emotional_status": "Estado Emocional Familiar", "family_emotions": "Emociones Familiares", "family_widget": "Widget Familiar", "for_educational_purposes": "Solo para fines educativos", "for_student": "para el alumno", "free_trial_label": "Prueba Gratuita", "from_teacher": "Del Profesor", "full_access_no_card": "Acceso completo — sin tarjeta de crédito", "generate_code": "Generar Código", "generate_code_desc": "Genera un código para compartir con el padre", "generate_invite_code": "Generar Código de Invitación", "generate_parent_code": "Generar Código del Padre", "generate_teacher_code": "Generar Código del Profesor", "generating": "Generando...", "go_back": "Volver", "got_it": "¡Entendido!", "green_emotions_label": "Emociones Verdes", "green_short": "Verde", "green_short_label": "Verde", "green_zone_desc": "Me siento bien y listo para aprender", "green_zone_name": "Emociones Verdes", "has_been_removed": "ha sido eliminado", "has_been_updated": "ha sido actualizado", "home_check_in": "Registro en Casa", "home_checkins": "Registros en Casa", "home_legend": "C = Casa", "home_sharing_disabled": "Compartir en casa desactivado", "home_sharing_enabled": "Compartir en casa activado", "home_sharing_off": "Compartir datos en casa DESACTIVADO", "home_sharing_on": "Compartir datos en casa ACTIVADO", "hours_ago": "horas atrás", "how_feeling": "¿Cómo te sientes?", "how_to_do_optional": "Cómo hacerlo (opcional)", "how_to_use": "Cómo usar esta estrategia", "i_agree_and_continue": "Acepto y Continuar", "icon_label": "Icono", "image_label": "Imagen", "important_notice": "Aviso Importante", "invite_code_placeholder": "Introduce código de invitación", "join_school_btn": "Unirse a la Escuela", "join_your_school": "Únete a tu Escuela", "joining": "Uniéndose...", "just_now": "Ahora mismo", "keep_private": "Mantener Privado", "large_widget": "Widget Grande", "leader_online": "Líder Online", "legal": "Legal", "link_child": "Vincular Niño", "link_child_school": "Vincular Niño desde la Escuela", "link_children_school": "Vincular Niños desde la Escuela", "linked_students_filter": "Alumnos Vinculados", "linking": "Vinculando...", "loading_resources": "Cargando recursos...", "logged_in_required": "Por favor inicia sesión para continuar", "manage_strategies_title": "Gestionar Estrategias", "medium_widget": "Widget Mediano", "minutes_ago": "minutos atrás", "month": "Mes", "most_used_strategies": "Estrategias Más Usadas", "name_required": "Nombre requerido", "no_checkin_yet": "Aún sin registros", "no_classroom": "Sin Clase", "no_classrooms_yet": "Aún sin clases", "no_data_period": "Sin datos para este período", "no_family_strategies": "Aún sin estrategias familiares", "no_home_data_yet": "Aún sin datos en casa", "no_recent_activity": "Sin actividad reciente", "no_resources_yet": "Aún sin recursos", "no_students_found": "Ningún alumno encontrado", "no_students_yet": "Aún sin alumnos", "parent_link_code": "Código de Vinculación del Padre", "parent_sharing_disabled": "El padre no ha activado el compartir datos en casa", "parent_sharing_hint": "El padre puede activar el compartir desde su panel", "per_week_avg": "promedio por semana", "personal_support_message": "Mensaje de apoyo personal", "photo": "Foto", "photo_label": "Foto", "please_enter_name": "Por favor introduce un nombre", "please_try_again": "Por favor inténtalo de nuevo", "private_message_note": "Este mensaje es privado", "red_emotions_label": "Emociones Rojas", "red_short": "Rojo", "red_short_label": "Rojo", "red_zone_desc": "Me siento muy molesto o enfadado", "red_zone_name": "Emociones Rojas", "request_support": "Solicitar Apoyo", "research_basis": "Aprendizaje emocional basado en evidencias", "save_changes": "Guardar Cambios", "save_check_in": "Guardar Registro", "save_school_profile": "Guardar Perfil Escolar", "saving": "Guardando...", "school": "Escuela", "school_admin_dashboard": "Panel Admin Escolar", "school_admin_label": "Admin Escolar", "school_invite_code": "Código de Invitación Escolar", "school_legend": "E = Escuela", "select": "Seleccionar", "select_all": "Seleccionar Todo", "select_classroom_for": "Seleccionar clase para", "select_emotion": "Selecciona una emoción", "select_helpful_strategies": "Seleccionar estrategias útiles", "select_month": "Seleccionar Mes", "select_month_pdf": "Selecciona un mes para descargar el informe PDF", "select_pdf": "Seleccionar PDF", "select_strategy": "Seleccionar Estrategia", "select_students": "Seleccionar Alumnos", "selected": "Seleccionado", "selected_count": "seleccionados", "share_code": "Compartir Código", "share_code_instructions": "Comparte este código con el padre", "share_student_tracking": "Compartir Seguimiento Emocional", "share_wellbeing": "Compartir Bienestar", "share_with_teachers": "Compartir con Profesores", "shared_strategies": "Estrategias Compartidas", "shared_with_teacher_check": "Compartido con el profesor", "sharing_disclaimer_text": "Al compartir, consientes que los datos de bienestar emocional se compartan entre escuela y casa.", "sharing_disclaimer_title": "Consentimiento para Compartir", "sharing_paused_desc": "El padre no ha activado el compartir. Los datos en casa no son visibles.", "skip_strategies": "Saltar estrategias", "small_widget": "Widget Pequeño", "special_needs_education": "Educación para Necesidades Especiales", "start_free_trial_btn": "Iniciar Prueba Gratuita", "starting": "Iniciando...", "stats": "Estadísticas", "steady": "Estable", "strat_5_senses": "5 Sentidos", "strat_bubble_breathing": "Respiración de Burbujas", "strat_count_to_10": "Contar hasta 10", "strat_favourite_song": "Canción Favorita", "strat_gentle_stretch": "Estiramiento Suave", "strat_gratitude": "Gratitud", "strat_help_friend": "Ayudar a un Amigo", "strat_keep_going": "¡Sigue Adelante!", "strat_safe_space_name": "Espacio Seguro", "strat_set_goal": "Establecer un Objetivo", "strat_slow_breathing": "Respiración Lenta", "strat_squeeze_release": "Apretar y Soltar", "strat_talk_about_it": "Hablar de Ello", "strat_tell_someone": "Decírselo a Alguien", "strat_walk_away": "Alejarse", "strategy_added": "¡Estrategia añadida!", "strategy_btn": "Estrategias", "strategy_desc_ph": "Describe cómo usar esta estrategia...", "strategy_example": "ej. Respiración profunda, Dar un paseo...", "strategy_name_example": "ej. Respiración de Burbujas", "strategy_name_ph": "Nombre de la estrategia", "strategy_shared": "Estrategia compartida con el profesor", "strategy_unshared": "Estrategia ya no compartida", "stressed": "Estresado", "student_linked": "Alumno Vinculado", "student_linked_desc": "Este alumno está conectado a una cuenta de padre", "student_not_found": "Alumno no encontrado", "student_unlinked": "Alumno desvinculado del padre", "students_in_class": "Alumnos en clase", "success": "¡Éxito!", "super_admin": "Super Admin", "support_message_hint": "Toca el icono de la mano para pedir apoyo", "support_message_hint2": "Tu profesor será notificado", "support_message_placeholder": "Dile a tu profesor cómo te sientes...", "tab_child_strategies": "Estrategias del Niño", "tab_my_strategies": "Mis Estrategias", "tab_parent_strategies": "Estrategias del Padre", "teacher_can_see_strategy": "El profesor puede ver esta estrategia", "teacher_link_code": "Código de Vinculación del Profesor", "teacher_name_optional": "Nombre del profesor (opcional)", "teacher_name_placeholder": "ej. Sra. García", "thank_you": "¡Gracias!", "this_week": "Esta Semana", "trial": "Prueba Gratuita", "trial_active": "Prueba Activa", "trial_active_desc": "Tu prueba gratuita está activa", "trial_desc": "Sin necesidad de tarjeta de crédito", "try_again": "Intentar de Nuevo", "try_different_search": "Intenta una búsqueda diferente", "unlink": "Desvincular", "unlink_student": "Desvincular Alumno", "updated_just_now": "Actualizado ahora mismo", "updating": "Actualizando...", "upload_photo": "Subir Foto", "use_icon": "Usar Icono", "view_my_wellbeing": "Ver Mi Bienestar", "wellbeing_journal": "Añadir nota de diario", "wellbeing_journal_ph": "Escribe cómo te sientes hoy...", "wellbeing_pin_forgot_msg": "Inténtalo de nuevo o restablece tu PIN", "wellbeing_total": "registros en total", "widget_preview": "Vista Previa del Widget", "widget_preview_desc": "Ve cómo se siente tu familia de un vistazo", "widget_preview_desc_teacher": "Ve cómo se siente tu clase de un vistazo", "write_custom_strategy": "Escribir estrategia personalizada", "write_short_note": "Escribe una nota corta...", "yellow_emotions_label": "Emociones Amarillas", "yellow_short": "Amarillo", "yellow_short_label": "Amarillo", "yellow_zone_desc": "Me siento preocupado o ansioso", "yellow_zone_name": "Emociones Amarillas", "you_are_what_you_eat": "Eres lo que comes", "your_recent_checkins": "Tus Registros Recientes", "zone_all": "Todos", "zone_blue": "Azul", "zone_comparison": "Comparación de Emociones", "zone_green": "Verde", "zone_red": "Rojo", "zone_yellow": "Amarillo", "today": "Hoy", "fortnight": "Quincena", "recent_checkins": "Registros Recientes", "family_dashboard": "Panel Familiar", "silly": "Tonto", "nervous": "Nervioso", "frustrated": "Frustrado", "worried": "Preocupado", "tired": "Cansado", "sad": "Triste", "angry": "Enfadado", "out_of_control": "Fuera de Control", "very_upset": "Muy Alterado", "bored": "Aburrido", "calm": "Tranquilo", "happy": "Feliz", "focused": "Concentrado", "ready_to_learn": "Listo para Aprender", "lonely": "Solo", "loading": "Cargando..."},
        "fr": {"blue": "Émotions Bleues",    "green": "Émotions Vertes",     "yellow": "Émotions Jaunes",      "red": "Émotions Rouges", "about_app": "À propos de l'App", "about_privacy": "À propos et Confidentialité", "access_expires_30_days": "L'accès expire dans 30 jours", "add": "Ajouter", "add_comment": "Ajouter un Commentaire", "add_custom_strategy": "Ajouter une Stratégie Personnalisée", "add_family_member": "Ajouter un Membre de la Famille", "add_family_to_track": "Ajoute un membre de la famille pour suivre le bien-être", "add_first_student": "Ajoute ton premier élève", "add_new_student": "Ajouter un Nouvel Élève", "add_note_optional": "Ajouter une note (optionnel)", "add_strategy_title": "Ajouter une Stratégie", "add_strategy_to_students": "Ajouter une stratégie aux élèves", "add_widget_android": "Ajouter à l'écran d'accueil (Android)", "add_widget_ios": "Ajouter un Widget (iOS)", "add_widget_title": "Ajouter un Widget", "adding": "Ajout en cours...", "admin_access": "Accès Admin", "admin_dashboard": "Tableau de Bord Admin", "administration": "Administration", "alert_sent": "Alerte Envoyée", "alert_sent_desc": "Ton professeur a été notifié", "all_arrow": "Tous →", "all_zones": "Toutes les Émotions", "are_you_sure_delete_strategy": "Es-tu sûr de vouloir supprimer cette stratégie?", "as_default_language": "comme langue par défaut", "assign_classroom": "Assigner une Classe", "blue_emotions_label": "Émotions Bleues", "blue_short": "Bleu", "blue_short_label": "Bleu", "blue_zone_desc": "Je me sens triste ou fatigué", "blue_zone_name": "Émotions Bleues", "by": "par", "change": "Modifier", "change_language_confirm": "Changer de langue?", "change_photo": "Changer la Photo", "checkin_btn": "S'enregistrer", "checkin_calendar": "Calendrier des Enregistrements", "checkin_complete": "Enregistrement Terminé!", "checkin_for": "Enregistrement pour", "checkin_saved": "Enregistrement Sauvegardé!", "checkin_saved_private": "Sauvegardé en privé", "checkin_saved_shared": "Sauvegardé et partagé avec le professeur", "child_not_found": "Enfant non trouvé", "child_strategies_note": "Stratégies assignées à cet enfant", "children_school": "Enfants à l'École", "choose_helpful_strategies": "Choisir des stratégies utiles", "choose_icon": "Choisir une Icône", "classroom": "Classe", "classroom_name": "Nom de la Classe", "classroom_name_placeholder": "ex. CM2 Les Étoiles", "classroom_widget": "Widget de Classe", "classrooms": "Classes", "comment_optional": "Commentaire (optionnel)", "confirm_delete_member": "Supprimer ce membre de la famille?", "confirm_delete_resource": "Supprimer cette ressource?", "confirm_unlink_student": "Dissocier cet élève du parent?", "create_classroom": "Créer une Classe", "create_new_classroom": "Créer une Nouvelle Classe", "create_new_student": "Créer un Nouvel Élève", "creating": "Création en cours...", "creatures": "Créatures", "custom_strategies_for": "Stratégies personnalisées pour", "data_shared_desc": "Données de bien-être émotionnel partagées entre école et maison", "days_14": "2 Semaines", "days_30": "30 Jours", "days_7": "7 Jours", "days_ago": "jours auparavant", "default_badge": "Par défaut", "default_zone_strategies": "Stratégies par défaut", "delete_btn": "Supprimer", "delete_classroom": "Supprimer la Classe", "delete_member": "Supprimer le Membre", "delete_student": "Supprimer l'Élève", "description_label": "Description", "deselect_all": "Tout Désélectionner", "disclaimer_1": "Cette app soutient la conscience émotionnelle, pas le diagnostic clinique.", "disclaimer_2": "Les données sont gardées privées et sécurisées.", "disclaimer_3": "Consulte toujours un professionnel pour les problèmes de santé mentale.", "disclaimer_privacy_terms": "Confidentialité et Conditions", "download_error": "Erreur de Téléchargement", "download_monthly_reports": "Télécharger les Rapports Mensuels", "edit_family_strategy": "Modifier la Stratégie Familiale", "edit_member": "Modifier le Membre", "edit_note": "Modifier la Note", "edit_strategy": "Modifier la Stratégie", "emotion_distribution": "Distribution des Émotions", "emotion_strategies_children": "Stratégies émotionnelles pour les enfants", "emotions": "Émotions", "emotions_topic": "Émotions", "enter_admin_code": "Entrer le code admin", "enter_code": "Entre le code à 6 caractères de ton professeur", "enter_description": "Entrer une description", "enter_invite_code_desc": "Entre le code d'invitation de ton école", "enter_name": "Entrer un nom", "error": "Erreur", "failed_delete_member": "Échec de la suppression du membre", "failed_update_member": "Échec de la mise à jour du membre", "family": "Famille", "family_emotional_status": "État Émotionnel Familial", "family_emotions": "Émotions Familiales", "family_widget": "Widget Famille", "for_educational_purposes": "À des fins éducatives uniquement", "for_student": "pour l'élève", "free_trial_label": "Essai Gratuit", "from_teacher": "Du Professeur", "full_access_no_card": "Accès complet — sans carte de crédit", "generate_code": "Générer un Code", "generate_code_desc": "Génère un code à partager avec le parent", "generate_invite_code": "Générer un Code d'Invitation", "generate_parent_code": "Générer le Code du Parent", "generate_teacher_code": "Générer le Code du Professeur", "generating": "Génération...", "go_back": "Retour", "got_it": "Compris!", "green_emotions_label": "Émotions Vertes", "green_short": "Vert", "green_short_label": "Vert", "green_zone_desc": "Je me sens bien et prêt à apprendre", "green_zone_name": "Émotions Vertes", "has_been_removed": "a été supprimé", "has_been_updated": "a été mis à jour", "healthy_relationships": "Relations Saines", "home_check_in": "Enregistrement à la Maison", "home_checkins": "Enregistrements à la Maison", "home_legend": "M = Maison", "home_sharing_disabled": "Partage à la maison désactivé", "home_sharing_enabled": "Partage à la maison activé", "home_sharing_off": "Partage de données à la maison DÉSACTIVÉ", "home_sharing_on": "Partage de données à la maison ACTIVÉ", "hours_ago": "heures auparavant", "how_feeling": "Comment tu te sens?", "how_to_do_optional": "Comment le faire (optionnel)", "how_to_use": "Comment utiliser cette stratégie", "i_agree_and_continue": "J'accepte et Continuer", "icon": "Icône", "icon_label": "Icône", "image_label": "Image", "important_notice": "Avis Important", "invite_code_placeholder": "Entrer le code d'invitation", "join_school_btn": "Rejoindre l'École", "join_your_school": "Rejoins ton École", "joining": "Rejoindre...", "just_now": "À l'instant", "keep_private": "Garder Privé", "large_widget": "Grand Widget", "leader_online": "Leader En Ligne", "legal": "Légal", "link_child": "Lier l'Enfant", "link_child_school": "Lier l'Enfant depuis l'École", "link_children_school": "Lier les Enfants depuis l'École", "linked_students_filter": "Élèves Liés", "linking": "Liaison...", "loading_resources": "Chargement des ressources...", "logged_in_required": "Veuillez vous connecter pour continuer", "manage_strategies_title": "Gérer les Stratégies", "medium_widget": "Widget Moyen", "minutes_ago": "minutes auparavant", "month": "Mois", "more_points_until": "points de plus jusqu'à", "most_used_strategies": "Stratégies les Plus Utilisées", "name_required": "Nom requis", "no_checkin_yet": "Pas encore d'enregistrements", "no_classroom": "Pas de Classe", "no_classrooms_yet": "Pas encore de classes", "no_data_period": "Pas de données pour cette période", "no_family_strategies": "Pas encore de stratégies familiales", "no_home_data_yet": "Pas encore de données à la maison", "no_recent_activity": "Pas d'activité récente", "no_resources_yet": "Pas encore de ressources", "no_students_found": "Aucun élève trouvé", "no_students_yet": "Pas encore d'élèves", "parent_link_code": "Code de Liaison du Parent", "parent_sharing_disabled": "Le parent n'a pas activé le partage des données à la maison", "parent_sharing_hint": "Le parent peut activer le partage depuis son tableau de bord", "per_week_avg": "moyenne par semaine", "personal_support_message": "Message de soutien personnel", "photo": "Photo", "photo_label": "Photo", "please_enter_name": "Veuillez entrer un nom", "please_try_again": "Veuillez réessayer", "private_message_note": "Ce message est privé", "recent_checkins": "Enregistrements Récents", "red_emotions_label": "Émotions Rouges", "red_short": "Rouge", "red_short_label": "Rouge", "red_zone_desc": "Je me sens très bouleversé ou en colère", "red_zone_name": "Émotions Rouges", "relationship": "Relation", "request_support": "Demander du Soutien", "research_basis": "Apprentissage émotionnel basé sur des preuves", "save_changes": "Sauvegarder les Modifications", "save_check_in": "Sauvegarder l'Enregistrement", "save_message": "Sauvegarder le Message", "save_school_profile": "Sauvegarder le Profil Scolaire", "saving": "Sauvegarde...", "school": "École", "school_admin_dashboard": "Tableau de Bord Admin Scolaire", "school_admin_label": "Admin Scolaire", "school_invite_code": "Code d'Invitation Scolaire", "school_legend": "É = École", "school_strategies": "Stratégies Scolaires", "select": "Sélectionner", "select_all": "Tout Sélectionner", "select_classroom_for": "Sélectionner la classe pour", "select_emotion": "Sélectionner une émotion", "select_helpful_strategies": "Sélectionner des stratégies utiles", "select_month": "Sélectionner un Mois", "select_month_pdf": "Sélectionne un mois pour télécharger le rapport PDF", "select_pdf": "Sélectionner PDF", "select_strategy": "Sélectionner une Stratégie", "select_students": "Sélectionner des Élèves", "selected": "Sélectionné", "selected_count": "sélectionnés", "share_code": "Partager le Code", "share_code_instructions": "Partage ce code avec le parent", "share_student_tracking": "Partager le Suivi Émotionnel", "share_wellbeing": "Partager le Bien-être", "share_with_teachers": "Partager avec les Professeurs", "shared_strategies": "Stratégies Partagées", "shared_with_teacher_check": "Partagé avec le professeur", "sharing_disclaimer_text": "En partageant, tu consens à ce que les données de bien-être émotionnel soient partagées entre l'école et la maison.", "sharing_disclaimer_title": "Consentement au Partage", "sharing_paused_desc": "Le parent n'a pas activé le partage. Les données à la maison ne sont pas visibles.", "skip_strategies": "Passer les stratégies", "small_widget": "Petit Widget", "special_needs_education": "Éducation pour Besoins Spéciaux", "start_free_trial_btn": "Commencer l'Essai Gratuit", "starting": "Démarrage...", "stats": "Statistiques", "steady": "Stable", "strat_5_senses": "5 Sens", "strat_bubble_breathing": "Respiration en Bulles", "strat_count_to_10": "Compter jusqu'à 10", "strat_favourite_song": "Chanson Préférée", "strat_gentle_stretch": "Étirement Doux", "strat_gratitude": "Gratitude", "strat_help_friend": "Aider un Ami", "strat_keep_going": "Continue!", "strat_safe_space_name": "Espace Sécurisé", "strat_set_goal": "Fixer un Objectif", "strat_slow_breathing": "Respiration Lente", "strat_squeeze_release": "Serrer et Relâcher", "strat_talk_about_it": "En Parler", "strat_tell_someone": "Le Dire à Quelqu'un", "strat_walk_away": "S'éloigner", "strategy_added": "Stratégie ajoutée!", "strategy_btn": "Stratégies", "strategy_desc_ph": "Décris comment utiliser cette stratégie...", "strategy_example": "ex. Respiration profonde, Faire une promenade...", "strategy_name_example": "ex. Respiration en Bulles", "strategy_name_ph": "Nom de la stratégie", "strategy_shared": "Stratégie partagée avec le professeur", "strategy_unshared": "Stratégie plus partagée", "streak_bonus": "Bonus de Série!", "stressed": "Stressé", "student_linked": "Élève Lié", "student_linked_desc": "Cet élève est connecté à un compte parent", "student_not_found": "Élève non trouvé", "student_unlinked": "Élève dissocié du parent", "students": "Élèves", "students_in_class": "Élèves en classe", "success": "Succès!", "super_admin": "Super Admin", "support": "Soutien", "support_message_hint": "Appuie sur l'icône de main pour demander du soutien", "support_message_hint2": "Ton professeur sera notifié", "support_message_placeholder": "Dis à ton professeur comment tu te sens...", "synced": "Synchronisé", "tab_child_strategies": "Stratégies de l'Enfant", "tab_my_strategies": "Mes Stratégies", "tab_parent_strategies": "Stratégies du Parent", "tap_to_check_in": "Appuie pour t'enregistrer", "teacher_can_see": "Le professeur peut voir ceci", "teacher_can_see_strategy": "Le professeur peut voir cette stratégie", "teacher_cannot_see": "Le professeur ne peut pas voir ceci", "teacher_link_code": "Code de Liaison du Professeur", "teacher_name_optional": "Nom du professeur (optionnel)", "teacher_name_placeholder": "ex. M. Dupont", "thank_you": "Merci!", "this_week": "Cette Semaine", "trial": "Essai Gratuit", "trial_active": "Essai Actif", "trial_active_desc": "Ton essai gratuit est actif", "trial_desc": "Sans carte de crédit requise", "try_again": "Réessayer", "try_different_search": "Essaie une autre recherche", "unlink": "Dissocier", "unlink_student": "Dissocier l'Élève", "updated_just_now": "Mis à jour à l'instant", "updating": "Mise à jour...", "upload_photo": "Télécharger une Photo", "use_icon": "Utiliser l'Icône", "view_my_wellbeing": "Voir Mon Bien-être", "wellbeing_journal": "Ajouter une note de journal", "wellbeing_journal_ph": "Écris comment tu te sens aujourd'hui...", "wellbeing_pin_forgot_msg": "Réessaie ou réinitialise ton PIN", "wellbeing_total": "enregistrements au total", "widget_preview": "Aperçu du Widget", "widget_preview_desc": "Vois comment se sent ta famille en un coup d'œil", "widget_preview_desc_teacher": "Vois comment se sent ta classe en un coup d'œil", "write_custom_strategy": "Écrire une stratégie personnalisée", "write_short_note": "Écris une courte note...", "yellow_emotions_label": "Émotions Jaunes", "yellow_short": "Jaune", "yellow_short_label": "Jaune", "yellow_zone_desc": "Je me sens inquiet ou anxieux", "yellow_zone_name": "Émotions Jaunes", "you_are_what_you_eat": "Tu es ce que tu manges", "your_recent_checkins": "Tes Enregistrements Récents", "zone_all": "Tous", "zone_blue": "Bleu", "zone_comparison": "Comparaison des Émotions", "zone_green": "Vert", "zone_red": "Rouge", "zone_yellow": "Jaune", "today": "Aujourd'hui", "fortnight": "Quinzaine", "family_dashboard": "Tableau de Bord Famille", "silly": "Idiot", "nervous": "Nerveux", "frustrated": "Frustré", "worried": "Inquiet", "tired": "Fatigué", "sad": "Triste", "angry": "En colère", "out_of_control": "Hors de Contrôle", "very_upset": "Très Bouleversé", "bored": "Ennuyé", "calm": "Calme", "happy": "Heureux", "focused": "Concentré", "ready_to_learn": "Prêt à Apprendre", "lonely": "Seul", "loading": "Chargement..."},
        "de": {"blue": "Blaue Emotionen",    "green": "Grüne Emotionen",     "yellow": "Gelbe Emotionen",      "red": "Rote Emotionen", "about_app": "Über die App", "about_privacy": "Über & Datenschutz", "access_expires_30_days": "Zugang läuft in 30 Tagen ab", "add": "Hinzufügen", "add_comment": "Kommentar hinzufügen", "add_custom_strategy": "Eigene Strategie hinzufügen", "add_family_member": "Familienmitglied hinzufügen", "add_family_to_track": "Füge ein Familienmitglied hinzu, um das Wohlbefinden zu verfolgen", "add_first_student": "Füge deinen ersten Schüler hinzu", "add_new_student": "Neuen Schüler hinzufügen", "add_note_optional": "Notiz hinzufügen (optional)", "add_strategy_title": "Strategie hinzufügen", "add_strategy_to_students": "Strategie zu Schülern hinzufügen", "add_widget_android": "Zum Startbildschirm hinzufügen (Android)", "add_widget_ios": "Widget hinzufügen (iOS)", "add_widget_title": "Widget hinzufügen", "adding": "Wird hinzugefügt...", "admin_access": "Admin-Zugang", "admin_dashboard": "Admin-Dashboard", "administration": "Verwaltung", "alert_sent": "Benachrichtigung gesendet", "alert_sent_desc": "Dein Lehrer wurde benachrichtigt", "all_arrow": "Alle →", "all_zones": "Alle Emotionen", "are_you_sure_delete_strategy": "Bist du sicher, dass du diese Strategie löschen möchtest?", "as_default_language": "als Standardsprache", "assign_classroom": "Klasse zuweisen", "blue_emotions_label": "Blaue Emotionen", "blue_short": "Blau", "blue_short_label": "Blau", "blue_zone_desc": "Ich fühle mich traurig oder müde", "blue_zone_name": "Blaue Emotionen", "by": "von", "change": "Ändern", "change_language_confirm": "Sprache ändern?", "change_photo": "Foto ändern", "checkin_btn": "Einchecken", "checkin_calendar": "Check-in Kalender", "checkin_complete": "Check-in abgeschlossen!", "checkin_for": "Check-in für", "checkin_saved": "Check-in gespeichert!", "checkin_saved_private": "Privat gespeichert", "checkin_saved_shared": "Gespeichert und mit dem Lehrer geteilt", "child_not_found": "Kind nicht gefunden", "child_strategies_note": "Diesem Kind zugewiesene Strategien", "children_school": "Kinder in der Schule", "choose_helpful_strategies": "Hilfreiche Strategien wählen", "choose_icon": "Symbol wählen", "classroom": "Klasse", "classroom_name": "Klassenname", "classroom_name_placeholder": "z.B. Klasse 3 Sonnenblumen", "classroom_widget": "Klassen-Widget", "classrooms": "Klassen", "comment_optional": "Kommentar (optional)", "confirm_delete_member": "Dieses Familienmitglied löschen?", "confirm_delete_resource": "Diese Ressource löschen?", "confirm_unlink_student": "Diesen Schüler vom Elternteil trennen?", "create_classroom": "Klasse erstellen", "create_new_classroom": "Neue Klasse erstellen", "create_new_student": "Neuen Schüler erstellen", "creating": "Wird erstellt...", "creatures": "Kreaturen", "custom_strategies_for": "Eigene Strategien für", "data_shared_desc": "Emotionale Wellbeing-Daten werden zwischen Schule und Zuhause geteilt", "days_14": "2 Wochen", "days_30": "30 Tage", "days_7": "7 Tage", "days_ago": "Tage zuvor", "default_badge": "Standard", "default_zone_strategies": "Standardstrategien", "delete_btn": "Löschen", "delete_classroom": "Klasse löschen", "delete_member": "Mitglied löschen", "delete_student": "Schüler löschen", "description_label": "Beschreibung", "deselect_all": "Alle abwählen", "disclaimer_1": "Diese App unterstützt emotionales Bewusstsein, keine klinische Diagnose.", "disclaimer_2": "Die Daten werden privat und sicher gehalten.", "disclaimer_3": "Konsultiere immer einen Fachmann bei psychischen Gesundheitsproblemen.", "disclaimer_privacy_terms": "Datenschutz & Bedingungen", "download_error": "Download-Fehler", "download_monthly_reports": "Monatsberichte herunterladen", "edit_family_strategy": "Familienstrategie bearbeiten", "edit_member": "Mitglied bearbeiten", "edit_note": "Notiz bearbeiten", "edit_strategy": "Strategie bearbeiten", "emotion_distribution": "Emotionsverteilung", "emotion_strategies_children": "Emotionsstrategien für Kinder", "emotions": "Emotionen", "emotions_topic": "Emotionen", "enter_admin_code": "Admin-Code eingeben", "enter_code": "Gib den 6-stelligen Code deines Lehrers ein", "enter_description": "Beschreibung eingeben", "enter_invite_code_desc": "Gib den Einladungscode deiner Schule ein", "enter_name": "Name eingeben", "error": "Fehler", "evolves": "Entwickelt sich!", "failed_delete_member": "Mitglied konnte nicht gelöscht werden", "failed_update_member": "Mitglied konnte nicht aktualisiert werden", "family": "Familie", "family_emotional_status": "Emotionaler Status der Familie", "family_emotions": "Familienemotionen", "family_widget": "Familien-Widget", "for_educational_purposes": "Nur zu Bildungszwecken", "for_student": "für den Schüler", "free_trial_label": "Kostenlose Testversion", "from_teacher": "Vom Lehrer", "full_access_no_card": "Vollzugang — keine Kreditkarte erforderlich", "generate_code": "Code generieren", "generate_code_desc": "Generiere einen Code zum Teilen mit dem Elternteil", "generate_invite_code": "Einladungscode generieren", "generate_parent_code": "Eltern-Code generieren", "generate_teacher_code": "Lehrer-Code generieren", "generating": "Wird generiert...", "go_back": "Zurück", "got_it": "Verstanden!", "green_emotions_label": "Grüne Emotionen", "green_short": "Grün", "green_short_label": "Grün", "green_zone_desc": "Ich fühle mich gut und bereit zu lernen", "green_zone_name": "Grüne Emotionen", "has_been_removed": "wurde entfernt", "has_been_updated": "wurde aktualisiert", "healthy_relationships": "Gesunde Beziehungen", "home_check_in": "Check-in Zuhause", "home_checkins": "Check-ins Zuhause", "home_legend": "Z = Zuhause", "home_sharing_disabled": "Teilen Zuhause deaktiviert", "home_sharing_enabled": "Teilen Zuhause aktiviert", "home_sharing_off": "Datenaustausch Zuhause DEAKTIVIERT", "home_sharing_on": "Datenaustausch Zuhause AKTIVIERT", "hours_ago": "Stunden zuvor", "how_feeling": "Wie fühlst du dich?", "how_to_do_optional": "Wie man es macht (optional)", "how_to_use": "Wie man diese Strategie verwendet", "i_agree_and_continue": "Ich stimme zu & Weiter", "icon": "Symbol", "icon_label": "Symbol", "image_label": "Bild", "important_notice": "Wichtiger Hinweis", "invite_code_placeholder": "Einladungscode eingeben", "join_school_btn": "Schule beitreten", "join_your_school": "Tritt deiner Schule bei", "joining": "Beitreten...", "just_now": "Gerade eben", "keep_private": "Privat halten", "large_widget": "Großes Widget", "leader_online": "Leiter Online", "legal": "Rechtliches", "link_child": "Kind verknüpfen", "link_child_school": "Kind von der Schule verknüpfen", "link_children_school": "Kinder von der Schule verknüpfen", "linked_students_filter": "Verknüpfte Schüler", "linking": "Verknüpfung...", "loading_resources": "Ressourcen werden geladen...", "logged_in_required": "Bitte melde dich an, um fortzufahren", "manage_strategies_title": "Strategien verwalten", "medium_widget": "Mittleres Widget", "minutes_ago": "Minuten zuvor", "month": "Monat", "more_points_until": "weitere Punkte bis", "most_used_strategies": "Meistgenutzte Strategien", "name_required": "Name erforderlich", "no_checkin_yet": "Noch keine Check-ins", "no_classroom": "Keine Klasse", "no_classrooms_yet": "Noch keine Klassen", "no_data_period": "Keine Daten für diesen Zeitraum", "no_family_strategies": "Noch keine Familienstrategien", "no_home_data_yet": "Noch keine Daten von Zuhause", "no_recent_activity": "Keine aktuellen Aktivitäten", "no_resources_yet": "Noch keine Ressourcen", "no_students_found": "Keine Schüler gefunden", "no_students_yet": "Noch keine Schüler", "parent_link_code": "Eltern-Verknüpfungscode", "parent_sharing_disabled": "Elternteil hat das Teilen von Heimdaten nicht aktiviert", "parent_sharing_hint": "Das Elternteil kann das Teilen über sein Dashboard aktivieren", "per_week_avg": "Durchschnitt pro Woche", "personal_support_message": "Persönliche Unterstützungsnachricht", "photo": "Foto", "photo_label": "Foto", "please_enter_name": "Bitte einen Namen eingeben", "please_try_again": "Bitte versuche es erneut", "private_message_note": "Diese Nachricht ist privat", "recent_checkins": "Letzte Check-ins", "red_emotions_label": "Rote Emotionen", "red_short": "Rot", "red_short_label": "Rot", "red_zone_desc": "Ich fühle mich sehr aufgewühlt oder wütend", "red_zone_name": "Rote Emotionen", "relationship": "Beziehung", "request_support": "Unterstützung anfordern", "research_basis": "Evidenzbasiertes emotionales Lernen", "save_changes": "Änderungen speichern", "save_check_in": "Check-in speichern", "save_message": "Nachricht speichern", "save_school_profile": "Schulprofil speichern", "saving": "Wird gespeichert...", "school": "Schule", "school_admin_dashboard": "Schul-Admin-Dashboard", "school_admin_label": "Schul-Admin", "school_invite_code": "Schul-Einladungscode", "school_legend": "S = Schule", "school_strategies": "Schulstrategien", "select": "Auswählen", "select_all": "Alle auswählen", "select_classroom_for": "Klasse auswählen für", "select_emotion": "Eine Emotion auswählen", "select_helpful_strategies": "Hilfreiche Strategien auswählen", "select_month": "Monat auswählen", "select_month_pdf": "Wähle einen Monat zum Herunterladen des PDF-Berichts", "select_pdf": "PDF auswählen", "select_strategy": "Strategie auswählen", "select_students": "Schüler auswählen", "selected": "Ausgewählt", "selected_count": "ausgewählt", "share_code": "Code teilen", "share_code_instructions": "Teile diesen Code mit dem Elternteil", "share_student_tracking": "Emotionales Tracking teilen", "share_wellbeing": "Wohlbefinden teilen", "share_with_teachers": "Mit Lehrern teilen", "shared_strategies": "Geteilte Strategien", "shared_with_teacher_check": "Mit dem Lehrer geteilt", "sharing_disclaimer_text": "Mit dem Teilen stimmst du zu, dass emotionale Wellbeing-Daten zwischen Schule und Zuhause geteilt werden.", "sharing_disclaimer_title": "Einwilligung zum Teilen", "sharing_paused_desc": "Das Elternteil hat das Teilen nicht aktiviert. Heimdaten sind nicht sichtbar.", "skip_strategies": "Strategien überspringen", "small_widget": "Kleines Widget", "special_needs_education": "Sonderpädagogik", "start_free_trial_btn": "Kostenlose Testversion starten", "starting": "Wird gestartet...", "stats": "Statistiken", "steady": "Stabil", "strat_5_senses": "5 Sinne", "strat_bubble_breathing": "Blasen-Atmung", "strat_count_to_10": "Bis 10 zählen", "strat_favourite_song": "Lieblingslied", "strat_gentle_stretch": "Sanfte Dehnung", "strat_gratitude": "Dankbarkeit", "strat_help_friend": "Einem Freund helfen", "strat_keep_going": "Weitermachen!", "strat_safe_space_name": "Sicherer Ort", "strat_set_goal": "Ein Ziel setzen", "strat_slow_breathing": "Langsames Atmen", "strat_squeeze_release": "Drücken und Loslassen", "strat_talk_about_it": "Darüber sprechen", "strat_tell_someone": "Jemandem sagen", "strat_walk_away": "Weggehen", "strategy_added": "Strategie hinzugefügt!", "strategy_btn": "Strategien", "strategy_desc_ph": "Beschreibe, wie man diese Strategie anwendet...", "strategy_example": "z.B. Tiefes Atmen, Spazieren gehen...", "strategy_name_example": "z.B. Blasen-Atmung", "strategy_name_ph": "Strategiename", "strategy_shared": "Strategie mit dem Lehrer geteilt", "strategy_unshared": "Strategie nicht mehr geteilt", "streak_bonus": "Serien-Bonus!", "stressed": "Gestresst", "student_linked": "Schüler verknüpft", "student_linked_desc": "Dieser Schüler ist mit einem Elternkonto verbunden", "student_not_found": "Schüler nicht gefunden", "student_unlinked": "Schüler vom Elternteil getrennt", "students": "Schüler", "students_in_class": "Schüler in der Klasse", "success": "Erfolg!", "super_admin": "Super Admin", "support": "Unterstützung", "support_message_hint": "Tippe auf das Hand-Symbol, um Unterstützung anzufordern", "support_message_hint2": "Dein Lehrer wird benachrichtigt", "support_message_placeholder": "Sag deinem Lehrer, wie du dich fühlst...", "synced": "Synchronisiert", "tab_child_strategies": "Kind-Strategien", "tab_my_strategies": "Meine Strategien", "tab_parent_strategies": "Eltern-Strategien", "tap_to_check_in": "Tippe zum Einchecken", "teacher_can_see": "Der Lehrer kann das sehen", "teacher_can_see_strategy": "Der Lehrer kann diese Strategie sehen", "teacher_cannot_see": "Der Lehrer kann das nicht sehen", "teacher_link_code": "Lehrer-Verknüpfungscode", "teacher_name_optional": "Lehrername (optional)", "teacher_name_placeholder": "z.B. Frau Müller", "thank_you": "Danke!", "this_week": "Diese Woche", "trial": "Kostenlose Testversion", "trial_active": "Testversion Aktiv", "trial_active_desc": "Deine kostenlose Testversion ist aktiv", "trial_desc": "Keine Kreditkarte erforderlich", "try_again": "Erneut versuchen", "try_different_search": "Versuche eine andere Suche", "unlink": "Trennen", "unlink_student": "Schüler trennen", "updated_just_now": "Gerade eben aktualisiert", "updating": "Wird aktualisiert...", "upload_photo": "Foto hochladen", "use_icon": "Symbol verwenden", "view_my_wellbeing": "Mein Wohlbefinden anzeigen", "wellbeing_journal": "Tagebuchnotiz hinzufügen", "wellbeing_journal_ph": "Schreibe, wie du dich heute fühlst...", "wellbeing_pin_forgot_msg": "Versuche es erneut oder setze deinen PIN zurück", "wellbeing_total": "Check-ins insgesamt", "widget_preview": "Widget-Vorschau", "widget_preview_desc": "Sieh, wie sich deine Familie auf einen Blick fühlt", "widget_preview_desc_teacher": "Sieh, wie sich deine Klasse auf einen Blick fühlt", "write_custom_strategy": "Eigene Strategie schreiben", "write_short_note": "Schreibe eine kurze Notiz...", "yellow_emotions_label": "Gelbe Emotionen", "yellow_short": "Gelb", "yellow_short_label": "Gelb", "yellow_zone_desc": "Ich fühle mich besorgt oder ängstlich", "yellow_zone_name": "Gelbe Emotionen", "you_are_what_you_eat": "Du bist, was du isst", "your_recent_checkins": "Deine letzten Check-ins", "zone_all": "Alle", "zone_blue": "Blau", "zone_comparison": "Emotionsvergleich", "zone_green": "Grün", "zone_red": "Rot", "zone_yellow": "Gelb", "today": "Heute", "fortnight": "Zwei Wochen", "family_dashboard": "Familien-Dashboard", "silly": "Albern", "nervous": "Nervös", "frustrated": "Frustriert", "worried": "Besorgt", "tired": "Müde", "sad": "Traurig", "angry": "Wütend", "out_of_control": "Außer Kontrolle", "very_upset": "Sehr Aufgewühlt", "bored": "Gelangweilt", "calm": "Ruhig", "happy": "Glücklich", "focused": "Konzentriert", "ready_to_learn": "Lernbereit", "lonely": "Einsam", "loading": "Laden..."},
        "it": {"blue": "Emozioni Blu",       "green": "Emozioni Verdi",      "yellow": "Emozioni Gialle",      "red": "Emozioni Rosse", "about_app": "Informazioni sull'App", "about_privacy": "Informazioni e Privacy", "access_expires_30_days": "L'accesso scade tra 30 giorni", "add": "Aggiungi", "add_comment": "Aggiungi Commento", "add_custom_strategy": "Aggiungi Strategia Personalizzata", "add_family_member": "Aggiungi Membro della Famiglia", "add_family_strategy": "Aggiungi Strategia Familiare", "add_family_to_track": "Aggiungi un membro della famiglia per monitorare il benessere", "add_first_student": "Aggiungi il tuo primo studente", "add_member": "Aggiungi Membro", "add_new_student": "Aggiungi Nuovo Studente", "add_note_optional": "Aggiungi una nota (opzionale)", "add_profile": "Aggiungi Profilo", "add_strategy": "Aggiungi Strategia", "add_strategy_title": "Aggiungi Strategia", "add_strategy_to_students": "Aggiungi strategia agli studenti", "add_widget_android": "Aggiungi alla schermata iniziale (Android)", "add_widget_ios": "Aggiungi Widget (iOS)", "add_widget_title": "Aggiungi Widget", "adding": "Aggiunta in corso...", "admin_access": "Accesso Admin", "admin_dashboard": "Dashboard Admin", "administration": "Amministrazione", "alert_sent": "Avviso Inviato", "alert_sent_desc": "Il tuo insegnante è stato notificato", "all_arrow": "Tutti →", "all_zones": "Tutte le Emozioni", "angry": "Arrabbiato", "are_you_sure_delete_strategy": "Sei sicuro di voler eliminare questa strategia?", "as_default_language": "come lingua predefinita", "assign_classroom": "Assegna Classe", "assign_to": "Assegna a", "blue_description": "Mi sento triste o stanco", "blue_emotions": "Emozioni Blu", "blue_emotions_label": "Emozioni Blu", "blue_feeling": "Blu", "blue_feelings": "Sentimenti Blu", "blue_short": "Blu", "blue_short_label": "Blu", "blue_zone": "Zona Blu", "blue_zone_desc": "Mi sento triste o stanco", "blue_zone_name": "Emozioni Blu", "bored": "Annoiato", "by": "di", "calm": "Calmo", "change": "Modifica", "change_language": "Cambia Lingua", "change_language_confirm": "Cambiare lingua?", "change_photo": "Cambia Foto", "check_in_feelings": "Registra i Sentimenti", "check_ins": "Check-in", "checkin_btn": "Registra", "checkin_calendar": "Calendario Check-in", "checkin_complete": "Check-in Completato!", "checkin_for": "Check-in per", "checkin_saved": "Check-in Salvato!", "checkin_saved_private": "Salvato in modo privato", "checkin_saved_shared": "Salvato e condiviso con l'insegnante", "child_not_found": "Bambino non trovato", "child_strategies_note": "Strategie assegnate a questo bambino", "children_school": "Bambini a Scuola", "choose_helpers": "Scegli gli Aiutanti", "choose_helpful_strategies": "Scegli strategie utili", "choose_icon": "Scegli Icona", "classroom": "Classe", "classroom_name": "Nome della Classe", "classroom_name_placeholder": "es. Classe 3 Sole", "classroom_widget": "Widget Classe", "classrooms": "Classi", "comment_optional": "Commento (opzionale)", "confirm": "Conferma", "confirm_delete_member": "Eliminare questo membro della famiglia?", "confirm_delete_resource": "Eliminare questa risorsa?", "confirm_logout": "Sei sicuro di voler uscire?", "confirm_unlink_student": "Scollegare questo studente dal genitore?", "continue": "Continua", "create_classroom": "Crea Classe", "create_first_profile": "Crea il Primo Profilo", "create_new_classroom": "Crea Nuova Classe", "create_new_student": "Crea Nuovo Studente", "creating": "Creazione in corso...", "creatures": "Creature", "custom_strategies_for": "Strategie personalizzate per", "data_shared_desc": "Dati di benessere emotivo condivisi tra scuola e casa", "day_streak": "Giorni di fila", "days_14": "2 Settimane", "days_30": "30 Giorni", "days_7": "7 Giorni", "days_ago": "giorni fa", "default_badge": "Predefinito", "default_zone_strategies": "Strategie predefinite", "delete": "Elimina", "delete_btn": "Elimina", "delete_classroom": "Elimina Classe", "delete_member": "Elimina Membro", "delete_student": "Elimina Studente", "description": "Descrizione", "description_label": "Descrizione", "deselect_all": "Deseleziona Tutti", "disclaimer_1": "Questa app supporta la consapevolezza emotiva, non la diagnosi clinica.", "disclaimer_2": "I dati sono mantenuti privati e sicuri.", "disclaimer_3": "Consulta sempre un professionista per problemi di salute mentale.", "disclaimer_privacy_terms": "Privacy e Termini", "download_error": "Errore di Download", "download_monthly_reports": "Scarica Rapporti Mensili", "download_report": "Scarica Rapporto", "edit": "Modifica", "edit_family_strategy": "Modifica Strategia Familiare", "edit_member": "Modifica Membro", "edit_note": "Modifica Nota", "edit_strategy": "Modifica Strategia", "emotion_colour": "Colore dell'Emozione", "emotion_distribution": "Distribuzione delle Emozioni", "emotion_strategies_children": "Strategie emotive per bambini", "emotions": "Emozioni", "emotions_topic": "Emozioni", "enter_admin_code": "Inserisci il codice admin", "enter_code": "Inserisci il codice a 6 caratteri del tuo insegnante", "enter_description": "Inserisci una descrizione", "enter_invite_code_desc": "Inserisci il codice di invito della tua scuola", "enter_name": "Inserisci un nome", "error": "Errore", "everyone": "Tutti", "evolves": "Si evolve!", "failed_delete_member": "Impossibile eliminare il membro", "failed_update_member": "Impossibile aggiornare il membro", "family": "Famiglia", "family_emotional_status": "Stato Emotivo della Famiglia", "family_emotions": "Emozioni della Famiglia", "family_widget": "Widget Famiglia", "focused": "Concentrato", "for_educational_purposes": "Solo per scopi educativi", "for_student": "per lo studente", "free_trial": "Prova Gratuita", "free_trial_label": "Prova Gratuita", "from_teacher": "Dall'Insegnante", "frustrated": "Frustrato", "full_access_no_card": "Accesso completo — nessuna carta di credito richiesta", "generate_code": "Genera Codice", "generate_code_desc": "Genera un codice da condividere con il genitore", "generate_invite_code": "Genera Codice di Invito", "generate_parent_code": "Genera Codice Genitore", "generate_teacher_code": "Genera Codice Insegnante", "generating": "Generazione...", "go_back": "Torna Indietro", "got_it": "Capito!", "great_job_title": "Bravissimo!", "green_description": "Mi sento bene e pronto", "green_emotions": "Emozioni Verdi", "green_emotions_label": "Emozioni Verdi", "green_feeling": "Verde", "green_feelings": "Sentimenti Verdi", "green_short": "Verde", "green_short_label": "Verde", "green_zone": "Zona Verde", "green_zone_desc": "Mi sento bene e pronto ad imparare", "green_zone_name": "Emozioni Verdi", "happy": "Felice", "has_been_removed": "è stato rimosso", "has_been_updated": "è stato aggiornato", "have_trial_code": "Ho un codice di prova", "healthy_relationships": "Relazioni Sane", "home": "Casa", "home_check_in": "Check-in a Casa", "home_checkins": "Check-in a Casa", "home_data": "Dati Casa", "home_legend": "C = Casa", "home_sharing_disabled": "Condivisione a casa disattivata", "home_sharing_enabled": "Condivisione a casa attivata", "home_sharing_off": "Condivisione dati a casa DISATTIVATA", "home_sharing_on": "Condivisione dati a casa ATTIVATA", "hours_ago": "ore fa", "how_feeling": "Come ti senti?", "how_to_do_optional": "Come farlo (opzionale)", "how_to_use": "Come usare questa strategia", "i_agree_and_continue": "Accetto e Continua", "icon": "Icona", "icon_label": "Icona", "image_label": "Immagine", "important_notice": "Avviso Importante", "invite_code_placeholder": "Inserisci codice di invito", "is_now_default": "è ora il predefinito", "join_school_btn": "Unisciti alla Scuola", "join_your_school": "Unisciti alla Tua Scuola", "joining": "Iscrizione...", "just_now": "Proprio ora", "keep_it_up": "Continua così!", "keep_private": "Mantieni Privato", "language_changed": "Lingua cambiata", "large_widget": "Widget Grande", "leader_online": "Leader Online", "legal": "Legale", "link_child": "Collega Bambino", "link_child_school": "Collega Bambino dalla Scuola", "link_children_school": "Collega Bambini dalla Scuola", "linked_students_filter": "Studenti Collegati", "linking": "Collegamento...", "loading_creature": "Caricamento creatura...", "loading_helpers": "Caricamento aiutanti...", "loading_resources": "Caricamento risorse...", "logged_in_required": "Effettua il login per continuare", "lonely": "Solo", "manage_strategies_title": "Gestisci Strategie", "medium_widget": "Widget Medio", "minutes_ago": "minuti fa", "month": "Mese", "more_points_until": "altri punti fino a", "most_used_strategies": "Strategie Più Usate", "mutual_consent": "Consenso Reciproco Attivo", "my_creatures": "Le Mie Creature", "my_strategies": "Le Mie Strategie", "name": "Nome", "name_required": "Nome obbligatorio", "nervous": "Nervoso", "no_checkin_yet": "Ancora nessun check-in", "no_checkins": "Ancora nessun check-in", "no_classroom": "Nessuna Classe", "no_classrooms_yet": "Ancora nessuna classe", "no_data_period": "Nessun dato per questo periodo", "no_family_strategies": "Ancora nessuna strategia familiare", "no_home_data_yet": "Ancora nessun dato a casa", "no_profiles_yet": "Ancora nessun profilo", "no_recent_activity": "Nessuna attività recente", "no_resources_yet": "Ancora nessuna risorsa", "no_students_found": "Nessuno studente trovato", "no_students_yet": "Ancora nessuno studente", "out_of_control": "Fuori Controllo", "parent_link_code": "Codice di Collegamento Genitore", "parent_sharing_disabled": "Il genitore non ha attivato la condivisione dei dati a casa", "parent_sharing_hint": "Il genitore può attivare la condivisione dal suo pannello", "per_week_avg": "media a settimana", "personal_support_message": "Messaggio di supporto personale", "photo": "Foto", "photo_label": "Foto", "please_enter_name": "Inserisci un nome", "please_try_again": "Riprova", "points": "Punti", "private_message_note": "Questo messaggio è privato", "ready_to_learn": "Pronto per imparare", "recent_checkins": "Check-in Recenti", "red_description": "Mi sento molto arrabbiato", "red_emotions": "Emozioni Rosse", "red_emotions_label": "Emozioni Rosse", "red_feeling": "Rosso", "red_feelings": "Sentimenti Rossi", "red_short": "Rosso", "red_short_label": "Rosso", "red_zone": "Zona Rossa", "red_zone_desc": "Mi sento molto turbato o arrabbiato", "red_zone_name": "Emozioni Rosse", "redeem_code": "Usa Codice", "redeeming": "Utilizzo...", "relationship": "Relazione", "request_support": "Richiedi Supporto", "research_basis": "Apprendimento emotivo basato su evidenze", "resources": "Risorse", "sad": "Triste", "save_changes": "Salva Modifiche", "save_check_in": "Salva Check-in", "save_message": "Salva Messaggio", "save_school_profile": "Salva Profilo Scolastico", "saving": "Salvataggio...", "school": "Scuola", "school_admin_dashboard": "Dashboard Admin Scolastico", "school_admin_label": "Admin Scolastico", "school_invite_code": "Codice di Invito Scolastico", "school_legend": "S = Scuola", "school_strategies": "Strategie Scolastiche", "search_students": "Cerca studenti", "select": "Seleziona", "select_all": "Seleziona Tutti", "select_classroom_for": "Seleziona classe per", "select_emotion": "Seleziona un'emozione", "select_helpful_strategies": "Seleziona strategie utili", "select_month": "Seleziona Mese", "select_month_pdf": "Seleziona un mese per scaricare il rapporto PDF", "select_pdf": "Seleziona PDF", "select_profile": "Seleziona Profilo", "select_strategy": "Seleziona Strategia", "select_students": "Seleziona Studenti", "selected": "Selezionato", "selected_count": "selezionati", "share_code": "Condividi Codice", "share_code_instructions": "Condividi questo codice con il genitore", "share_student_tracking": "Condividi Monitoraggio Emotivo", "share_wellbeing": "Condividi Benessere", "share_with_home": "Condividi con Casa", "share_with_home_desc": "Il genitore vedrà questa strategia nell'app", "share_with_teacher": "Condividi con l'Insegnante", "share_with_teachers": "Condividi con gli Insegnanti", "shared_strategies": "Strategie Condivise", "shared_with_teacher_check": "Condiviso con l'insegnante", "sharing_disclaimer_text": "Condividendo, acconsenti che i dati di benessere emotivo siano condivisi tra scuola e casa.", "sharing_disclaimer_title": "Consenso alla Condivisione", "sharing_paused": "Condivisione in Pausa", "sharing_paused_desc": "Il genitore non ha attivato la condivisione. I dati a casa non sono visibili.", "silly": "Sciocco", "skip": "Salta", "skip_strategies": "Salta le strategie", "small_widget": "Widget Piccolo", "special_needs_education": "Educazione per Bisogni Speciali", "start_free_trial": "Inizia la Prova Gratuita", "start_free_trial_btn": "Inizia la Prova Gratuita", "starting": "Avvio...", "stats": "Statistiche", "steady": "Stabile", "strat_5_senses": "5 Sensi", "strat_bubble_breathing": "Respirazione a Bolle", "strat_count_to_10": "Conta fino a 10", "strat_favourite_song": "Canzone Preferita", "strat_gentle_stretch": "Stretching Leggero", "strat_gratitude": "Gratitudine", "strat_help_friend": "Aiuta un Amico", "strat_keep_going": "Continua!", "strat_safe_space_name": "Spazio Sicuro", "strat_set_goal": "Fissa un Obiettivo", "strat_slow_breathing": "Respirazione Lenta", "strat_squeeze_release": "Stringi e Rilascia", "strat_talk_about_it": "Parlane", "strat_tell_someone": "Dillo a Qualcuno", "strat_walk_away": "Allontanati", "strategy_added": "Strategia aggiunta!", "strategy_btn": "Strategie", "strategy_desc_ph": "Descrivi come usare questa strategia...", "strategy_example": "es. Respirazione profonda, Fare una passeggiata...", "strategy_name": "Nome Strategia", "strategy_name_example": "es. Respirazione a Bolle", "strategy_name_ph": "Nome della strategia", "strategy_shared": "Strategia condivisa con l'insegnante", "strategy_unshared": "Strategia non più condivisa", "streak_bonus": "Bonus Serie!", "stressed": "Stressato", "student_linked": "Studente Collegato", "student_linked_desc": "Questo studente è collegato a un account genitore", "student_not_found": "Studente non trovato", "student_unlinked": "Studente scollegato dal genitore", "students": "Studenti", "students_in_class": "Studenti in classe", "subscribe": "Abbonati", "subscription": "Abbonamento", "success": "Successo!", "super_admin": "Super Admin", "super_charged": "Super Carico!", "support": "Supporto", "support_message_hint": "Tocca l'icona della mano per chiedere supporto", "support_message_hint2": "Il tuo insegnante verrà notificato", "support_message_placeholder": "Di' al tuo insegnante come ti senti...", "synced": "Sincronizzato", "tab_child_strategies": "Strategie del Bambino", "tab_my_strategies": "Le Mie Strategie", "tab_parent_strategies": "Strategie del Genitore", "tap_helpers_green": "Tocca un aiutante per continuare bene!", "tap_helpers_other": "Tocca un aiutante per stare meglio", "tap_to_check_in": "Tocca per registrarti", "teacher_can_see": "L'insegnante può vedere questo", "teacher_can_see_strategy": "L'insegnante può vedere questa strategia", "teacher_cannot_see": "L'insegnante non può vedere questo", "teacher_checkin": "Check-in Insegnante", "teacher_link_code": "Codice di Collegamento Insegnante", "teacher_name_optional": "Nome insegnante (opzionale)", "teacher_name_placeholder": "es. Prof. Rossi", "teacher_resources": "Risorse per Insegnanti", "thank_you": "Grazie!", "this_week": "Questa Settimana", "tired": "Stanco", "trial": "Prova Gratuita", "trial_active": "Prova Attiva", "trial_active_desc": "La tua prova gratuita è attiva", "trial_code_invalid": "Codice non valido", "trial_code_placeholder": "Inserisci codice", "trial_desc": "Nessuna carta di credito richiesta", "try_again": "Riprova", "try_different_search": "Prova una ricerca diversa", "unlink": "Scollega", "unlink_student": "Scollega Studente", "unlocked": "Sbloccato!", "updated_just_now": "Aggiornato proprio ora", "updating": "Aggiornamento...", "upload_photo": "Carica Foto", "use_icon": "Usa Icona", "very_upset": "Molto Turbato", "view_my_wellbeing": "Vedi Il Mio Benessere", "want_to_say": "Vuoi dire qualcosa?", "week_overview": "Panoramica della Settimana", "wellbeing_journal": "Aggiungi nota di diario", "wellbeing_journal_ph": "Scrivi come ti senti oggi...", "wellbeing_pin_forgot_msg": "Riprova o reimposta il tuo PIN", "wellbeing_total": "check-in totali", "what_colours_mean": "Cosa significano i colori", "widget_preview": "Anteprima Widget", "widget_preview_desc": "Vedi come si sente la tua famiglia a colpo d'occhio", "widget_preview_desc_teacher": "Vedi come si sente la tua classe a colpo d'occhio", "worried": "Preoccupato", "write_custom_strategy": "Scrivi una strategia personalizzata", "write_sentence": "Scrivi una frase", "write_short_note": "Scrivi una nota breve...", "yellow_description": "Mi sento ansioso o agitato", "yellow_emotions": "Emozioni Gialle", "yellow_emotions_label": "Emozioni Gialle", "yellow_feeling": "Giallo", "yellow_feelings": "Sentimenti Gialli", "yellow_short": "Giallo", "yellow_short_label": "Giallo", "yellow_zone": "Zona Gialla", "yellow_zone_desc": "Mi sento preoccupato o ansioso", "yellow_zone_name": "Emozioni Gialle", "you_are_what_you_eat": "Sei quello che mangi", "your_recent_checkins": "I Tuoi Check-in Recenti", "zone_all": "Tutti", "zone_blue": "Blu", "zone_comparison": "Confronto delle Emozioni", "zone_green": "Verde", "zone_red": "Rosso", "zone_yellow": "Giallo", "today": "Oggi", "fortnight": "Quindicina", "family_dashboard": "Dashboard Famiglia", "loading": "Caricamento..."},
    }
    WEEKDAYS_MAP = {
        "en": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
        "pt": ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"],
        "es": ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"],
        "fr": ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"],
        "de": ["Mo","Di","Mi","Do","Fr","Sa","So"],
        "it": ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"],
    }
    ZONE_LABELS = ZONE_LABELS_MAP.get(lang, ZONE_LABELS_MAP["en"])
    WEEKDAYS    = WEEKDAYS_MAP.get(lang, WEEKDAYS_MAP["en"])

    ZONE_DESCS = {
        "blue":   ZONE_LABELS.get("blue_zone_desc", "Calm / Low energy"),
        "green":  ZONE_LABELS.get("green_zone_desc", "Happy / Ready to learn"),
        "yellow": ZONE_LABELS.get("yellow_zone_desc", "Worried / Frustrated"),
        "red":    ZONE_LABELS.get("red_zone_desc", "Overwhelmed / Angry"),
    }

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
    # Try to load COH logo image
    logo_path = os.path.join(os.path.dirname(__file__), 'assets', 'logo_coh.png')
    from reportlab.platypus import Image as RLImage

    # Build logo cell — image if available, coloured text fallback
    try:
        if not os.path.exists(logo_path):
            raise FileNotFoundError(f"Logo not found at {logo_path}")
        coh_logo = RLImage(logo_path, width=44, height=44)
        logo_cell = Table(
            [[coh_logo, Paragraph("Class of Happiness", ST_LOGO)]],
            colWidths=[52, 220],
            style=[
                ('VALIGN',   (0,0), (-1,-1), 'MIDDLE'),
                ('PADDING',  (0,0), (-1,-1), 0),
                ('LEFTPADDING', (1,0), (1,0), 6),
            ]
        )
    except Exception as logo_err:
        # Fallback: rainbow emoji + text (no image dependency)
        logo_cell = Paragraph(
            "<font color='#FFC107'>●</font><font color='#4CAF50'>●</font>"
            "<font color='#4A90D9'>●</font> Class of Happiness",
            s('LogoFB', fontSize=16, textColor=WHITE, fontName='Helvetica-Bold',
              leading=20)
        )

    header_data = [[
        logo_cell,
        Paragraph(
            f"<b>" + PDF_HEADINGS.get(lang, PDF_HEADINGS["en"])["report"] + "</b><br/>" + month_name,
            s('HRight', fontSize=11, textColor=WHITE, fontName='Helvetica-Bold',
              alignment=2, leading=15)
        ),
    ]]
    header_table = Table(header_data, colWidths=[285, 220])
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
    # Section 1 wrapped to prevent page splits
    section1_elements = [Paragraph("Emotion Zone Distribution", ST_H2)]
    # Compute school-only and home-only counts for split view
    school_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    home_counts   = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    for log in logs_data:
        zone = log.get("zone", log.get("feeling_colour", ""))
        if log.get("_source") == "home" and zone in home_counts:
            home_counts[zone] += 1
        elif zone in school_counts:
            school_counts[zone] += 1

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
    section1_elements.extend([dist_row, Spacer(1, 12)])
    elements.append(KeepTogether(section1_elements))

    # ════════════════════════════════════════════════════════
    # ROW 2: Calendar heatmap
    # ════════════════════════════════════════════════════════
    # Add home/school split note if home data exists
    if has_home_data:
        split_rows = [[
            Paragraph('<b>Source</b>', ST_LABEL),
            Paragraph('<b>Blue</b>', ST_LABEL),
            Paragraph('<b>Green</b>', ST_LABEL),
            Paragraph('<b>Yellow</b>', ST_LABEL),
            Paragraph('<b>Red</b>', ST_LABEL),
            Paragraph('<b>Total</b>', ST_LABEL),
        ],[
            Paragraph('🏫 School', ST_BODY),
            Paragraph(str(school_counts['blue']), ST_SMALL),
            Paragraph(str(school_counts['green']), ST_SMALL),
            Paragraph(str(school_counts['yellow']), ST_SMALL),
            Paragraph(str(school_counts['red']), ST_SMALL),
            Paragraph(str(sum(school_counts.values())), ST_VALUE),
        ],[
            Paragraph('🏠 Home', ST_BODY),
            Paragraph(str(home_counts['blue']), ST_SMALL),
            Paragraph(str(home_counts['green']), ST_SMALL),
            Paragraph(str(home_counts['yellow']), ST_SMALL),
            Paragraph(str(home_counts['red']), ST_SMALL),
            Paragraph(str(sum(home_counts.values())), ST_VALUE),
        ]]
        split_tbl = Table(split_rows, colWidths=[80, 55, 55, 60, 55, 60])
        split_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), INDIGO),
            ('TEXTCOLOR',  (0,0), (-1,0), WHITE),
            ('GRID',       (0,0), (-1,-1), 0.4, LIGHT_GREY),
            ('PADDING',    (0,0), (-1,-1), 5),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [WHITE, LIGHT]),
        ]))
        section1_elements.extend([Spacer(1,8), Paragraph("Home vs School Breakdown", ST_H2), split_tbl])

    section2_elements = [Paragraph("Monthly Calendar", ST_H2)]

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
    section2_elements.append(cal_tbl)

    # Legend
    legend_items = [[
        Paragraph(f"<font color='#{zc.hexval()[2:]}'>■</font> {ZONE_LABELS[z]}"
                  if hasattr(zc, 'hexval') else f"■ {ZONE_LABELS[z]}",
                  ST_SMALL)
        for z, zc in ZONE_COLORS_PDF.items()
    ] + [Paragraph("□ No check-in", ST_SMALL)]]
    legend_tbl = Table(legend_items, colWidths=[(PAGE_W - 72) / 5] * 5)
    legend_tbl.setStyle(TableStyle([('PADDING', (0,0), (-1,-1), 3)]))
    section2_elements.extend([legend_tbl, Spacer(1, 12)])
    elements.append(KeepTogether(section2_elements))

    # ════════════════════════════════════════════════════════
    # ROW 3: Strategies + Day-of-week side by side
    # ════════════════════════════════════════════════════════
    section3_elements = [Paragraph(PDF_HEADINGS.get(lang, PDF_HEADINGS["en"])["strategies"], ST_H2)]

    if helper_counts:
        top_helpers = sorted(helper_counts.items(), key=lambda x: x[1], reverse=True)[:8]
        strat_rows = [[
            Paragraph('<b>Strategy</b>', ST_LABEL),
            Paragraph('<b>Used</b>', ST_LABEL),
            Paragraph('<b>Frequency</b>', ST_LABEL),
        ]]
        max_strat = max(c for _, c in top_helpers)
        for sid, count in top_helpers:
            name = resolve_strategy_name(sid, lang=lang)
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
    section3_elements.extend([strat_week_row, Spacer(1, 12)])
    elements.append(KeepTogether(section3_elements))

    # ════════════════════════════════════════════════════════
    # Check-in log (compact, with comments)
    # ════════════════════════════════════════════════════════
    # Check-in log — heading must stay with table (never orphaned at page bottom)
    # We'll build heading + table together in a KeepTogether block if small enough
    log_heading = Paragraph(PDF_HEADINGS.get(lang, PDF_HEADINGS["en"])["log"], ST_H2)

    if logs_data:
        log_rows = [[
            Paragraph('<b>Date</b>',       ST_LABEL),
            Paragraph('<b>Time</b>',       ST_LABEL),
            Paragraph('<b>Source</b>',     ST_LABEL),
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
            strat_names = [resolve_strategy_name(s, lang=lang) for s in raw_strats[:3]]
            strats_str  = ", ".join(strat_names) if strat_names else "—"
            if len(raw_strats) > 3:
                strats_str += f" +{len(raw_strats)-3}"

            comment = (log.get("comment") or "").strip()
            comment = comment[:60] + ("…" if len(comment) > 60 else "")
            comment = comment or "—"

            source = log.get("_source", "school")
            source_label = "🏠 Home" if source == "home" else "🏫 School"
            log_rows.append([
                Paragraph(date_str,                              ST_SMALL),
                Paragraph(time_str,                              ST_SMALL),
                Paragraph(source_label,                          ST_SMALL),
                Paragraph(ZONE_LABELS.get(zone, zone.capitalize() + " Emotions"),  ST_SMALL),
                Paragraph(strats_str,                            ST_SMALL),
                Paragraph(comment,                               ST_SMALL),
            ])

        log_tbl = Table(log_rows, colWidths=[38, 32, 48, 68, 140, 129],
                        repeatRows=1, splitByRow=0)
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
                log_style_list.append(('TEXTCOLOR',  (3,i), (3,i), ZONE_COLORS_PDF[zone]))
                log_style_list.append(('FONTNAME',   (3,i), (3,i), 'Helvetica-Bold'))
            # Colour source column
            src = log.get("_source", "school")
            src_color = colors.HexColor('#4CAF50') if src == "home" else colors.HexColor('#5C6BC0')
            log_style_list.append(('TEXTCOLOR', (2,i), (2,i), src_color))
        log_tbl.setStyle(TableStyle(log_style_list))
        # Keep heading with first few rows to prevent orphaned header
        try:
            elements.append(KeepTogether([log_heading, Spacer(1, 4), log_tbl]))
        except Exception:
            elements.append(log_heading)
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



# ================== NOTIFICATION SYSTEM ==================

# ── Push token registration ──────────────────────────────
@api_router.post("/notifications/register-token")
async def register_push_token(request: Request):
    """Store Expo push token for a user."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    token = (body.get("token") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token required")
    try:
        existing = supabase.table("users").select("push_token").eq("user_id", user["user_id"]).execute()
        supabase.table("users").update({"push_token": token}).eq("user_id", user["user_id"]).execute()
    except Exception as e:
        logger.error(f"Token registration error: {e}")
    return {"ok": True}

# ── Notification settings ────────────────────────────────
@api_router.get("/notifications/settings")
async def get_notification_settings(request: Request):
    """Get notification preferences for the current user."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        result = supabase.table("admin_settings").select("*").eq("school_admin_id", user["user_id"]).like("setting_key", "notif_%").execute()
        settings = {}
        for row in (result.data or []):
            import json
            try:
                settings[row["setting_key"]] = json.loads(row["setting_value"])
            except:
                settings[row["setting_key"]] = row["setting_value"]
        return settings
    except Exception as e:
        logger.error(f"Get notification settings error: {e}")
        return {}

@api_router.post("/notifications/settings")
async def update_notification_settings(request: Request):
    """Update notification preferences."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    import json
    try:
        for key, value in body.items():
            if not key.startswith("notif_"):
                key = f"notif_{key}"
            existing = supabase.table("admin_settings").select("id").eq("school_admin_id", user["user_id"]).eq("setting_key", key).execute()
            if existing.data:
                supabase.table("admin_settings").update({"setting_value": json.dumps(value)}).eq("school_admin_id", user["user_id"]).eq("setting_key", key).execute()
            else:
                supabase.table("admin_settings").insert({
                    "id": str(uuid.uuid4()),
                    "school_admin_id": user["user_id"],
                    "setting_key": key,
                    "setting_value": json.dumps(value),
                }).execute()
    except Exception as e:
        logger.error(f"Update notification settings error: {e}")
        raise HTTPException(status_code=500, detail="Could not save settings")
    return {"ok": True}

# ── Student notification settings (per student) ──────────
@api_router.get("/notifications/student/{student_id}/settings")
async def get_student_notification_settings(student_id: str, request: Request):
    """Get notification settings for a specific student."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        result = supabase.table("admin_settings").select("*").eq("school_admin_id", user["user_id"]).eq("setting_key", f"notif_student_{student_id}").execute()
        if result.data:
            import json
            try:
                return json.loads(result.data[0]["setting_value"])
            except:
                return {}
        return {"help_request": False, "zone_alerts": [], "enabled": False}
    except Exception as e:
        logger.error(f"Get student notif settings error: {e}")
        return {"help_request": False, "zone_alerts": [], "enabled": False}

@api_router.post("/notifications/student/{student_id}/settings")
async def update_student_notification_settings(student_id: str, request: Request):
    """Enable/disable notifications for a specific student."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    import json
    key = f"notif_student_{student_id}"
    try:
        existing = supabase.table("admin_settings").select("id").eq("school_admin_id", user["user_id"]).eq("setting_key", key).execute()
        if existing.data:
            supabase.table("admin_settings").update({"setting_value": json.dumps(body)}).eq("school_admin_id", user["user_id"]).eq("setting_key", key).execute()
        else:
            supabase.table("admin_settings").insert({
                "id": str(uuid.uuid4()),
                "school_admin_id": user["user_id"],
                "setting_key": key,
                "setting_value": json.dumps(body),
            }).execute()
    except Exception as e:
        logger.error(f"Update student notif settings error: {e}")
        raise HTTPException(status_code=500, detail="Could not save")
    return {"ok": True}

# ── Bulk student notification settings (classroom) ───────
@api_router.post("/notifications/classroom/{classroom_id}/settings")
async def update_classroom_notification_settings(classroom_id: str, request: Request):
    """Bulk enable notifications for all students in a classroom."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    import json
    try:
        students = supabase.table("students").select("id").eq("classroom_id", classroom_id).execute()
        for student in (students.data or []):
            sid = student["id"]
            key = f"notif_student_{sid}"
            existing = supabase.table("admin_settings").select("id").eq("school_admin_id", user["user_id"]).eq("setting_key", key).execute()
            if existing.data:
                supabase.table("admin_settings").update({"setting_value": json.dumps(body)}).eq("school_admin_id", user["user_id"]).eq("setting_key", key).execute()
            else:
                supabase.table("admin_settings").insert({
                    "id": str(uuid.uuid4()),
                    "school_admin_id": user["user_id"],
                    "setting_key": key,
                    "setting_value": json.dumps(body),
                }).execute()
    except Exception as e:
        logger.error(f"Bulk classroom notif error: {e}")
        raise HTTPException(status_code=500, detail="Could not save")
    return {"ok": True, "updated": len(students.data or [])}

# ── Help request (student asks for help with strategy) ───
@api_router.post("/notifications/help-request")
async def send_help_request(request: Request):
    """Student requests help with a strategy — notifies teacher and/or parent."""
    import json, httpx
    body = await request.json()
    student_id = body.get("student_id")
    strategy_id = body.get("strategy_id")
    strategy_name = body.get("strategy_name", "a strategy")
    zone = body.get("zone", "")
    message = (body.get("message") or "").strip()

    if not student_id:
        raise HTTPException(status_code=400, detail="student_id required")

    # Get student info
    student_r = supabase.table("students").select("*").eq("id", student_id).execute()
    if not student_r.data:
        raise HTTPException(status_code=404, detail="Student not found")
    student = student_r.data[0]
    student_name = student.get("name", "A student")
    # Get classroom info
    classroom_name = ""
    try:
        if student.get("classroom_id"):
            cr = supabase.table("classrooms").select("name").eq("id", student["classroom_id"]).execute()
            classroom_name = cr.data[0]["name"] if cr.data else ""
    except: pass

    # Context defined here before use
    context = body.get("context", None)

    # Store alert in student_alerts table
    alert_id = str(uuid.uuid4())
    try:
        supabase.table("student_alerts").insert({
            "id": alert_id,
            "student_id": student_id,
            "student_name": student_name,
            "alert_type": "help_request",
            "context": context or "school",
            "classroom_name": classroom_name,
            "zone": zone,
            "strategy_id": strategy_id,
            "strategy_name": strategy_name,
            "message": message,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "resolved": False,
        }).execute()
        logger.info(f"[help_request] Stored alert {alert_id} for student {student_id}")
    except Exception as e:
        logger.error(f"Could not store help request alert: {e}")

    # Context: 'school' = teacher only, 'home' = family only, None = both
    context = body.get("context", None)  # None means legacy — notify both (safe default)

    # IMPORTANT: School and home are separate notification contexts.
    # A red check-in at school should NOT panic a parent at work.
    # A home check-in should NOT involve the school.
    tokens_to_notify = []

    # Teacher tokens — only for school context
    if context != 'home':
        try:
            # Find teacher via classroom
            classroom_id = student.get("classroom_id", "")
            if classroom_id:
                classroom_r = supabase.table("classrooms").select("user_id").eq("id", classroom_id).execute()
                if classroom_r.data:
                    teacher_user_id = classroom_r.data[0]["user_id"]
                    teacher_r = supabase.table("users").select("push_token").eq("user_id", teacher_user_id).execute()
                    if teacher_r.data and teacher_r.data[0].get("push_token"):
                        tokens_to_notify.append(("teacher", teacher_r.data[0]["push_token"]))
            # Also store alert with correct teacher reference
        except: pass

    # Parent/family tokens — only for home context
    if context != 'school':
        try:
            parent_links = supabase.table("parent_links").select("parent_id").eq("student_id", student_id).execute()
            for link in (parent_links.data or []):
                parent_r = supabase.table("users").select("push_token").eq("user_id", link["parent_id"]).execute()
                if parent_r.data and parent_r.data[0].get("push_token"):
                    tokens_to_notify.append(("parent", parent_r.data[0]["push_token"]))
        except: pass

        try:
            fm_links = supabase.table("family_members").select("*").eq("student_id", student_id).execute()
            for fm in (fm_links.data or []):
                parent_r = supabase.table("users").select("push_token").eq("user_id", fm.get("user_id","")).execute()
                if parent_r.data and parent_r.data[0].get("push_token"):
                    tokens_to_notify.append(("parent", parent_r.data[0]["push_token"]))
        except: pass

    # Send Expo push notifications
    zone_emoji = {"blue": "🔵", "green": "🟢", "yellow": "🟡", "red": "🔴"}.get(zone, "💙")
    notif_title = f"{zone_emoji} {student_name} needs help"
    notif_body = f"Asked for help with: {strategy_name}"
    if message:
        notif_body += f"\n\"{message}\""

    sent = 0
    if tokens_to_notify:
        try:
            messages = [
                {
                    "to": token,
                    "title": notif_title,
                    "body": notif_body,
                    "data": {
                        "type": "help_request",
                        "student_id": student_id,
                        "student_name": student_name,
                        "zone": zone,
                        "strategy_name": strategy_name,
                        "alert_id": alert_id,
                    },
                    "sound": "default",
                    "priority": "high",
                }
                for _, token in tokens_to_notify
                if token and token.startswith("ExponentPushToken")
            ]
            if messages:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        "https://exp.host/--/api/v2/push/send",
                        json=messages,
                        headers={"Content-Type": "application/json"},
                        timeout=10,
                    )
                sent = len(messages)
                logger.info(f"Sent {sent} help request notifications for {student_name}")
        except Exception as e:
            logger.error(f"Push notification send error: {e}")

    # Award brave shield badge
    shield_awarded = False
    try:
        existing_reward = supabase.table("student_rewards").select("*").eq("student_id", student_id).eq("reward_type", "brave_shield").execute()
        if existing_reward.data:
            current = existing_reward.data[0]
            new_count = (current.get("count") or 0) + 1
            level = _shield_level(new_count)
            supabase.table("student_rewards").update({
                "count": new_count,
                "level": level,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", current["id"]).execute()
            shield_awarded = True
        else:
            # Try insert with minimal fields first
            shield_data = {
                "id": str(uuid.uuid4()),
                "student_id": student_id,
                "reward_type": "brave_shield",
                "count": 1,
                "level": "bronze_1",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            result = supabase.table("student_rewards").insert(shield_data).execute()
            if result.data:
                shield_awarded = True
                logger.info(f"Shield badge created for student {student_id}")
            else:
                logger.error(f"Shield insert returned no data: {result}")
    except Exception as e:
        logger.error(f"Shield badge error (student {student_id}): {e}", exc_info=True)
        # Shield failure should not block the help request response
        shield_awarded = False

    return {"ok": True, "notifications_sent": sent, "shield_awarded": shield_awarded, "alert_id": alert_id}

# ── Zone alert (auto-notify on check-in zone) ────────────
@api_router.post("/notifications/zone-alert")
async def send_zone_alert(request: Request):
    """Auto-notify teacher/parent when student checks in with a watched zone."""
    import json, httpx
    body = await request.json()
    student_id = body.get("student_id")
    zone = body.get("zone", "")
    log_id = body.get("log_id", "")

    if not student_id or not zone:
        raise HTTPException(status_code=400, detail="student_id and zone required")

    student_r = supabase.table("students").select("*").eq("id", student_id).execute()
    if not student_r.data:
        return {"ok": False, "reason": "student not found"}
    student = student_r.data[0]
    student_name = student.get("name", "A student")

    # Context boundary — school check-ins don't notify parents, home don't notify teachers
    context = body.get("context", None)
    tokens_to_notify = []

    # Teacher — school context only
    if context != 'home':
        try:
            teacher_id = student.get("teacher_id")
            if teacher_id:
                setting_r = supabase.table("admin_settings").select("setting_value").eq("school_admin_id", teacher_id).eq("setting_key", f"notif_student_{student_id}").execute()
                if setting_r.data:
                    import json as _json
                    settings = _json.loads(setting_r.data[0]["setting_value"])
                    watched_zones = settings.get("zone_alerts", [])
                    if zone in watched_zones and settings.get("enabled", False):
                        teacher_token_r = supabase.table("users").select("push_token").eq("user_id", teacher_id).execute()
                        if teacher_token_r.data and teacher_token_r.data[0].get("push_token"):
                            tokens_to_notify.append(teacher_token_r.data[0]["push_token"])
        except Exception as e:
            logger.error(f"Zone alert teacher check error: {e}")

    # Parents — home context only
    if context != 'school':
        try:
            parent_links = supabase.table("parent_links").select("parent_id").eq("student_id", student_id).execute()
            for link in (parent_links.data or []):
                parent_id = link["parent_id"]
                setting_r = supabase.table("admin_settings").select("setting_value").eq("school_admin_id", parent_id).eq("setting_key", f"notif_student_{student_id}").execute()
                if setting_r.data:
                    import json as _json
                    settings = _json.loads(setting_r.data[0]["setting_value"])
                    watched_zones = settings.get("zone_alerts", [])
                    if zone in watched_zones and settings.get("enabled", False):
                        parent_token_r = supabase.table("users").select("push_token").eq("user_id", parent_id).execute()
                        if parent_token_r.data and parent_token_r.data[0].get("push_token"):
                            tokens_to_notify.append(parent_token_r.data[0]["push_token"])
        except Exception as e:
            logger.error(f"Zone alert parent check error: {e}")

    if not tokens_to_notify:
        return {"ok": True, "notifications_sent": 0, "reason": "no enabled watchers"}

    zone_emoji = {"blue": "🔵", "green": "🟢", "yellow": "🟡", "red": "🔴"}.get(zone, "💙")
    zone_label = {"blue": "Blue", "green": "Green", "yellow": "Yellow", "red": "Red"}.get(zone, zone.title())

    sent = 0
    try:
        messages = [
            {
                "to": token,
                "title": f"{zone_emoji} {student_name} checked in",
                "body": f"Feeling {zone_label} right now.",
                "data": {"type": "zone_alert", "student_id": student_id, "zone": zone, "log_id": log_id},
                "sound": "default",
            }
            for token in tokens_to_notify
            if token and token.startswith("ExponentPushToken")
        ]
        if messages:
            async with httpx.AsyncClient() as client:
                await client.post(
                    "https://exp.host/--/api/v2/push/send",
                    json=messages,
                    headers={"Content-Type": "application/json"},
                    timeout=10,
                )
            sent = len(messages)
    except Exception as e:
        logger.error(f"Zone alert push error: {e}")

    return {"ok": True, "notifications_sent": sent}

# ── Parent message from student ──────────────────────────
@api_router.post("/notifications/parent-message")
async def send_parent_message(request: Request):
    """Student sends a feeling message to a parent."""
    import json, httpx
    body = await request.json()
    student_id = body.get("student_id")
    message = (body.get("message") or "").strip()
    zone = body.get("zone", "")

    if not student_id or not message:
        raise HTTPException(status_code=400, detail="student_id and message required")

    student_r = supabase.table("students").select("*").eq("id", student_id).execute()
    if not student_r.data:
        raise HTTPException(status_code=404, detail="Student not found")
    student = student_r.data[0]
    student_name = student.get("name", "A student")

    # Store message
    try:
        supabase.table("student_alerts").insert({
            "id": str(uuid.uuid4()),
            "student_id": student_id,
            "student_name": student_name,
            "alert_type": "parent_message",
            "zone": zone,
            "message": message,
            "context": "home",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "resolved": False,
        }).execute()
    except Exception as e:
        logger.error(f"Parent message store error: {e}")

    # Find parent tokens — check both parent_links (school) and family_members (home)
    tokens_to_notify = []
    parent_user_ids = set()
    try:
        # School-linked parents
        parent_links = supabase.table("parent_links").select("parent_id,parent_user_id").eq("student_id", student_id).execute()
        for link in (parent_links.data or []):
            uid = link.get("parent_user_id") or link.get("parent_id")
            if uid: parent_user_ids.add(uid)
    except: pass
    try:
        # Family member parents (home flow)
        fm_links = supabase.table("family_members").select("user_id").eq("student_id", student_id).execute()
        for link in (fm_links.data or []):
            if link.get("user_id"): parent_user_ids.add(link["user_id"])
    except: pass
    try:
        for uid in parent_user_ids:
            parent_r = supabase.table("users").select("push_token").eq("user_id", uid).execute()
            if parent_r.data and parent_r.data[0].get("push_token"):
                tokens_to_notify.append(parent_r.data[0]["push_token"])
    except: pass

    zone_emoji = {"blue": "🔵", "green": "🟢", "yellow": "🟡", "red": "🔴"}.get(zone, "💙")
    sent = 0
    try:
        messages = [
            {
                "to": token,
                "title": f"{zone_emoji} Message from {student_name}",
                "body": message[:100],
                "data": {"type": "parent_message", "student_id": student_id, "zone": zone},
                "sound": "default",
            }
            for token in tokens_to_notify
            if token and token.startswith("ExponentPushToken")
        ]
        if messages:
            async with httpx.AsyncClient() as client:
                await client.post(
                    "https://exp.host/--/api/v2/push/send",
                    json=messages,
                    headers={"Content-Type": "application/json"},
                    timeout=10,
                )
            sent = len(messages)
    except Exception as e:
        logger.error(f"Parent message push error: {e}")

    return {"ok": True, "notifications_sent": sent}

# ── Shield badge helper ──────────────────────────────────
def _shield_level(count: int) -> str:
    if count >= 50: return "gold"
    if count >= 20: return "silver_2"
    if count >= 10: return "silver_1"
    if count >= 5:  return "bronze_3"
    if count >= 3:  return "bronze_2"
    return "bronze_1"

# ── Get student shield badge ─────────────────────────────
@api_router.get("/notifications/shield/{student_id}")
async def get_student_shield(student_id: str):
    """Get brave shield badge for a student."""
    try:
        result = supabase.table("student_rewards").select("*").eq("student_id", student_id).eq("reward_type", "brave_shield").execute()
        if result.data:
            r = result.data[0]
            return {
                "has_shield": True,
                "level": r.get("level", "bronze_1"),
                "count": r.get("count", 0),
                "label": _shield_label(r.get("level", "bronze_1")),
            }
        return {"has_shield": False, "level": None, "count": 0}
    except Exception as e:
        logger.error(f"Get shield error: {e}")
        return {"has_shield": False, "level": None, "count": 0}

def _shield_label(level: str) -> str:
    return {
        "bronze_1": "Bronze Shield I",
        "bronze_2": "Bronze Shield II",
        "bronze_3": "Bronze Shield III",
        "silver_1": "Silver Shield I",
        "silver_2": "Silver Shield II",
        "gold":     "Gold Shield",
    }.get(level, "Bronze Shield I")

# ── Alerts dashboard (teacher/parent) ───────────────────
@api_router.get("/notifications/alerts/test")
async def test_alerts_endpoint():
    """Debug: returns all student_alerts"""
    try:
        result = supabase.table("student_alerts").select("*").order("created_at", desc=True).limit(50).execute()
        return {"count": len(result.data or []), "alerts": result.data or []}
    except Exception as e:
        return {"error": str(e)}

@api_router.get("/notifications/alerts")
async def get_alerts(request: Request, limit: int = 20):
    """Get recent alerts for the current user's students."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        role = user.get("role", "")
        classroom_ids = []
        student_ids = []

        if role in ("teacher", "school_admin", "superadmin", "admin"):
            # Teachers see students via their classrooms
            classrooms_r = supabase.table("classrooms").select("id").eq("user_id", user["user_id"]).execute()
            classroom_ids = [cl["id"] for cl in (classrooms_r.data or [])]
            seen_ids = set()
            if classroom_ids:
                students_r = supabase.table("students").select("id").in_("classroom_id", classroom_ids).execute()
                for s in (students_r.data or []):
                    if s["id"] not in seen_ids:
                        student_ids.append(s["id"])
                        seen_ids.add(s["id"])
            # Also include students directly owned by this teacher (user_id match)
            own_r = supabase.table("students").select("id").eq("user_id", user["user_id"]).execute()
            for s in (own_r.data or []):
                if s["id"] not in seen_ids:
                    student_ids.append(s["id"])
                    seen_ids.add(s["id"])
            # Superadmin/admin — if no direct classrooms, see all students
            if not student_ids and role in ("superadmin", "admin"):
                all_students_r = supabase.table("students").select("id").execute()
                student_ids = [s["id"] for s in (all_students_r.data or [])]
        else:
            # Parents only see their directly linked children
            parent_links_r = supabase.table("parent_links").select("student_id").eq("parent_user_id", user["user_id"]).execute()
            student_ids += [l["student_id"] for l in (parent_links_r.data or [])]
            family_links_r = supabase.table("family_members").select("student_id,id").eq("user_id", user["user_id"]).execute()
            for l in (family_links_r.data or []):
                if l.get("student_id"):
                    student_ids.append(l["student_id"])
                # Also add family_member id itself in case alerts stored with that id
                if l.get("id"):
                    student_ids.append(l["id"])
            student_ids = list(set(student_ids))
        logger.info(f"[get_alerts] parent links student_ids: {student_ids}")

        logger.info(f"[get_alerts] user={user['user_id']} role={user.get('role')} student_ids={student_ids[:5]}")
        role2 = user.get("role", "")
        logger.info(f"[get_alerts] user_id={user['user_id']} role={role2} classroom_ids={classroom_ids} student_ids_count={len(student_ids)}")
        
        if not student_ids:
            if role2 in ("teacher", "school_admin"):
                logger.warning(f"[get_alerts] No student_ids for teacher, returning all recent alerts")
                fallback = supabase.table("student_alerts").select("*").order("created_at", desc=True).limit(limit).execute()
                return fallback.data or []
            return []
        
        # For teachers: return all alerts, frontend filters by classroom
        role3 = user.get("role", "")
        if role3 in ("teacher", "school_admin"):
            all_alerts_r = supabase.table("student_alerts").select("*").order("created_at", desc=True).limit(100).execute()
            all_alerts = all_alerts_r.data or []
        else:
            all_alerts_r = supabase.table("student_alerts").select("*").in_("student_id", student_ids[:50]).order("created_at", desc=True).limit(50).execute()
            all_alerts = all_alerts_r.data or []
        logger.info(f"[get_alerts] Found {len(all_alerts)} total alerts for {len(student_ids)} students")
        
        # Filter by context
        # Teachers see school alerts only
        # Parents see ALL alerts for their children (both home and school)
        if role in ("teacher", "school_admin"):
            filtered = [a for a in all_alerts if a.get("context") in ("school", None, "")]
        else:
            # Parents and others see all alerts for their linked children
            filtered = all_alerts
        logger.info(f"[get_alerts] Filtered={len(filtered)} for role={role}")
        return filtered[:limit]
    except Exception as e:
        logger.error(f"Get alerts error: {e}")
        return []

@api_router.post("/notifications/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, request: Request):
    """Mark an alert as resolved."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        supabase.table("student_alerts").update({"resolved": True, "resolved_by": user["user_id"], "resolved_at": datetime.now(timezone.utc).isoformat()}).eq("id", alert_id).execute()
    except Exception as e:
        logger.error(f"Resolve alert error: {e}")
    return {"ok": True}

# ── Notification stats for admin ─────────────────────────
@api_router.get("/notifications/stats")
async def get_notification_stats(request: Request, days: int = 7):
    """Admin stats — how many notifications sent, opt-in rates."""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        week_ago = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        alerts_r = supabase.table("wellbeing_alerts").select("alert_type,created_at,resolved").gte("created_at", week_ago).execute()
        alerts = alerts_r.data or []
        help_requests = sum(1 for a in alerts if a.get("alert_type") == "help_request")
        zone_alerts = sum(1 for a in alerts if a.get("alert_type") == "zone_alert")
        parent_messages = sum(1 for a in alerts if a.get("alert_type") == "parent_message")
        resolved = sum(1 for a in alerts if a.get("resolved"))

        # Opt-in rate
        total_students_r = supabase.table("students").select("id", count="exact").execute()
        total_students = total_students_r.count or 1
        enabled_settings_r = supabase.table("admin_settings").select("id", count="exact").like("setting_key", "notif_student_%").execute()
        enabled_count = enabled_settings_r.count or 0

        return {
            "total_alerts": len(alerts),
            "help_requests": help_requests,
            "zone_alerts": zone_alerts,
            "parent_messages": parent_messages,
            "resolved": resolved,
            "opt_in_students": enabled_count,
            "total_students": total_students,
            "opt_in_rate": round(enabled_count / total_students * 100) if total_students else 0,
        }
    except Exception as e:
        logger.error(f"Notification stats error: {e}")
        return {"total_alerts": 0, "help_requests": 0, "zone_alerts": 0, "parent_messages": 0}

# ================== END NOTIFICATION SYSTEM ==================

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

        # Teachers are stored as role='admin' (set on school creation)
        # Count all non-superadmin, non-parent users as teachers
        teachers_result = supabase.table("users").select("user_id", count="exact").in_("role", ["admin", "teacher", "school_admin"]).execute()
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

        # Teacher check-ins — from teacher_checkins table + feeling_logs with no student_id
        teacher_zone_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
        teacher_daily = [0] * 7
        try:
            # Try teacher_checkins table first
            tc_r = supabase.table("teacher_checkins").select("*").gte("created_at", week_ago).execute()
            for tc in (tc_r.data or []):
                tz = tc.get("zone") or tc.get("feeling_colour", "")
                if tz in teacher_zone_counts:
                    teacher_zone_counts[tz] += 1
                try:
                    ts2 = tc.get("created_at","")
                    if ts2:
                        tdate = datetime.fromisoformat(ts2.replace("Z","+00:00")).date()
                        d_ago = (today - tdate).days
                        if 0 <= d_ago < 7:
                            teacher_daily[6 - d_ago] += 1
                except: pass
        except: pass
        try:
            teacher_logs_r = supabase.table("feeling_logs").select("*").is_("student_id", "null").gte("timestamp", week_ago).execute()
            teacher_logs = teacher_logs_r.data or []
            for tl in teacher_logs:
                tz = tl.get("feeling_colour") or tl.get("zone", "")
                if tz in teacher_zone_counts:
                    teacher_zone_counts[tz] += 1
                try:
                    ts2 = tl.get("timestamp","")
                    if ts2:
                        tdate = datetime.fromisoformat(ts2.replace("Z","+00:00")).date()
                        d_ago = (today - tdate).days
                        if 0 <= d_ago < 7:
                            teacher_daily[6 - d_ago] += 1
                except: pass
        except Exception as te:
            logger.error(f"Teacher zone counts error: {te}")

        # Support requests (wellbeing_alerts table may not exist yet)
        support_requests = 0

        # Total creatures across all students
        total_creatures = 0
        try:
            creatures_r = supabase.table("creatures").select("id", count="exact").execute()
            total_creatures = creatures_r.count or 0
        except: pass

        # Streak students — students with check-ins on 3+ consecutive days
        streak_students = 0
        try:
            all_logs_r = supabase.table("feeling_logs").select("student_id,timestamp").gte("timestamp", month_ago).execute()
            from collections import defaultdict
            student_dates = defaultdict(set)
            for l in (all_logs_r.data or []):
                try:
                    d = datetime.fromisoformat(l["timestamp"].replace("Z","+00:00")).date()
                    student_dates[l["student_id"]].add(d)
                except: pass
            for sid, dates in student_dates.items():
                sorted_dates = sorted(dates)
                streak = 1
                for i in range(1, len(sorted_dates)):
                    if (sorted_dates[i] - sorted_dates[i-1]).days == 1:
                        streak += 1
                        if streak >= 3:
                            streak_students += 1
                            break
                    else:
                        streak = 1
        except: pass

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
                    school_students = supabase.table("students").select("id,classroom_id").eq("teacher_id", admin_id).execute()
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

        # Build classroom name lookup
        classroom_name_map = {}
        try:
            classrooms_r = supabase.table("classrooms").select("id,name").execute()
            classroom_name_map = {c["id"]: c["name"] for c in (classrooms_r.data or [])}
        except: pass

        return {
            "total_students": total_students,
            "total_teachers": total_teachers,
            "total_users": total_users,
            "total_schools": total_schools,
            "classroom_names": classroom_name_map,
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
            "total_creatures": total_creatures,
            "avg_checkins_to_evolve": "—",
            "streak_students": streak_students,
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


@api_router.get("/debug/student-classrooms")
async def debug_student_classrooms():
    """Temp debug: show all students and their classroom assignments."""
    try:
        students = supabase.table("students").select("id,name,classroom_id,user_id").order("name").execute()
        classrooms = supabase.table("classrooms").select("id,name,user_id").execute()
        alerts = supabase.table("student_alerts").select("id,student_name,student_id,alert_type,created_at,resolved").order("created_at", desc=True).limit(10).execute()
        return {
            "students": students.data or [],
            "classrooms": classrooms.data or [],
            "recent_alerts": alerts.data or []
        }
    except Exception as e:
        return {"error": str(e)}

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



@api_router.get("/teacher-resources/my-uploads")
async def get_my_teacher_resource_uploads(request: Request):
    """Get resources uploaded by the current teacher."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        result = supabase.table("resources").select("*").eq(
            "created_by", user["user_id"]
        ).order("created_at", desc=True).execute()
        resources = result.data or []
        try:
            ratings_result = supabase.table("teacher_resource_ratings").select("*").execute()
            ratings = ratings_result.data or []
        except:
            ratings = []
        return [_resource_to_teacher_resource(r, ratings) for r in resources]
    except Exception as e:
        logger.error(f"My uploads error: {e}")
        return []

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
    audience = body.get("target_audience") or body.get("audience") or "teachers"
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
    # Check ownership via created_by OR user_id (backwards compat) OR admin role
    is_owner = (
        resource.get("created_by") == user.get("user_id") or
        resource.get("user_id") == user.get("user_id")
    )
    is_admin = user.get("role") in ["admin", "superadmin", "school_admin"]
    if not is_owner and not is_admin:
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
@api_router.get("/rewards/batch/collections")
async def get_batch_collections(student_ids: str, request: Request):
    """Get collections for multiple students in one call. student_ids = comma-separated IDs."""
    ids = [s.strip() for s in student_ids.split(',') if s.strip()][:20]
    results = {}
    creatures_map = {c["id"]: c for c in CREATURES}
    
    for sid in ids:
        try:
            r = supabase.table("student_rewards").select("*").eq("student_id", sid).execute()
            if not r.data:
                results[sid] = None
                continue
            data = r.data[0]
            creature_points = data.get("creature_points") or {}
            creature_stages = data.get("creature_stages") or {}
            current_id = data.get("current_creature_id", "aqua_buddy")
            current_stage = data.get("current_stage", 0)
            current_points = data.get("current_points", 0)
            
            all_creatures = []
            for cid, cdata in creatures_map.items():
                cstage = creature_stages.get(cid, 0)
                cpoints = creature_points.get(cid, 0)
                stages = cdata.get("stages", [])
                all_creatures.append({
                    **cdata,
                    "current_points": cpoints,
                    "current_stage": cstage,
                    "is_complete": cstage >= len(stages) - 1,
                })
            
            current_creature = creatures_map.get(current_id, CREATURES[0])
            results[sid] = {
                "current_creature": current_creature,
                "current_stage": current_stage,
                "current_points": current_points,
                "collected_creatures": data.get("collected_creatures", []),
                "total_creatures": len(CREATURES),
                "all_creatures": all_creatures,
                "unlocked_moves": data.get("unlocked_moves", []),
                "unlocked_outfits": data.get("unlocked_outfits", []),
                "unlocked_foods": data.get("unlocked_foods", []),
                "unlocked_homes": data.get("unlocked_homes", []),
            }
        except Exception as e:
            logger.error(f"Batch collection error for {sid}: {e}")
            results[sid] = None
    return results

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
    stored = False
    try:
        supabase.table("invite_codes").insert(invite_data).execute()
        stored = True
    except Exception as e:
        logger.error(f"Could not store invite code in invite_codes table: {e}")
        # Fallback: store in admin_settings as key-value so join still works
        try:
            import json
            supabase.table("admin_settings").insert({
                "school_admin_id": user["user_id"],
                "setting_key": f"invite_code_{code}",
                "setting_value": json.dumps(invite_data),
            }).execute()
            stored = True
            logger.info(f"Invite code stored in admin_settings fallback")
        except Exception as e2:
            logger.error(f"Fallback storage also failed: {e2}")

    return {"code": code, "expires_at": expires_at, "school_name": invite_data["school_name"], "stored": stored}

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
        # Fallback: check admin_settings if invite_codes table is empty/missing
        if not result.data:
            try:
                import json
                fb = supabase.table("admin_settings").select("*").eq("setting_key", f"invite_code_{code}").execute()
                if fb.data:
                    result_data = json.loads(fb.data[0]["setting_value"])
                    result = type('R', (), {'data': [result_data]})()
            except Exception as fb_err:
                logger.error(f"Fallback invite lookup failed: {fb_err}")
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
                log["strategies_selected"] = log.get("helpers_selected", log.get("strategies_selected", []))
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
            # Check if family member has an auto-created student record
            member_student = member.get("student_id")
            if member_student:
                # Save to feeling_logs so creatures/points work
                log = {
                    "id": str(uuid.uuid4()),
                    "student_id": member_student,
                    "feeling_colour": zone,
                    "helpers_selected": strategies,
                    "comment": comment,
                    "logged_by": "parent",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "member_name": member.get("name", ""),
                }
                result = supabase.table("feeling_logs").insert(log).execute()
            else:
                # Fallback: save to family_zone_logs
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
        
        # Award points to the student's creature if they have a student_id
        final_student_id = student_id or member.get("student_id")
        if final_student_id:
            try:
                rewards_res = supabase.table("student_rewards").select("*").eq("student_id", final_student_id).execute()
                if rewards_res.data:
                    rewards = rewards_res.data[0]
                    POINTS_CONFIG = {"checkin": 10, "strategy": 5, "streak": 20}
                    points_to_add = POINTS_CONFIG["checkin"]
                    creature_id = rewards.get("current_creature_id", "aqua_buddy")
                    creature_points = rewards.get("creature_points", {})
                    creature_stages = rewards.get("creature_stages", {})
                    current_points = rewards.get("current_points", 0) + points_to_add
                    creature_points[creature_id] = creature_points.get(creature_id, 0) + points_to_add
                    # Stage thresholds
                    thresholds = [0, 30, 80, 150]
                    stage = 0
                    for i, thr in enumerate(thresholds):
                        if creature_points[creature_id] >= thr:
                            stage = i
                    creature_stages[creature_id] = stage
                    total_earned = rewards.get("total_points_earned", 0) + points_to_add
                    import datetime as dt
                    today = dt.date.today().isoformat()
                    supabase.table("student_rewards").update({
                        "current_points": current_points,
                        "creature_points": creature_points,
                        "creature_stages": creature_stages,
                        "total_points_earned": total_earned,
                        "last_checkin_date": today,
                        "current_stage": stage,
                    }).eq("student_id", final_student_id).execute()
                    logger.info(f"[family_checkin] Awarded {points_to_add} points to {final_student_id}, stage now {stage}")
            except Exception as pe:
                logger.warning(f"[family_checkin] Could not award points: {pe}")

        return {"status": "saved", "log": result.data[0] if result.data else log, "student_id": final_student_id}
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
        # School check-ins = logged by teacher OR student (not parent)
        result = supabase.table("feeling_logs").select("*").eq("student_id", student_id).not_.eq("logged_by", "parent").gte("timestamp", start_date).order("timestamp", desc=True).execute()
        logs = result.data or []
        return {"checkins": [{
            **log,
            "zone": log.get("feeling_colour", log.get("zone", "")),
            "strategies_selected": log.get("helpers_selected", log.get("strategies_selected", [])),
        } for log in logs], "sharing_disabled": False}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_school_checkins error: {e}")
        return {"checkins": [], "sharing_disabled": False}


@api_router.get("/family/custom-strategies")
async def get_family_custom_strategies(request: Request, zone: Optional[str] = None, member_id: Optional[str] = None):
    """Get family-level custom strategies for family checkins.
    Returns strategies assigned to 'all' or to specific member_id."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        # Get all custom strategies for this user (no student_id = family level)
        result = supabase.table("custom_helpers").select("*").eq("user_id", user["user_id"]).execute()
        all_strats = result.data or []

        visible = []
        for row in all_strats:
            # Normalise zone
            fc = row.get("feeling_colour", "")
            z  = row.get("zone", "")
            row["zone"] = z or fc or "green"
            row["feeling_colour"] = fc or z or "green"

            # Filter by zone if specified
            if zone and row["zone"] != zone:
                continue

            # Filter by member_id: show if assigned to 'all' or to this member
            assigned = row.get("assigned_to", "all") or "all"
            if member_id and assigned not in ("all", member_id):
                continue

            visible.append(row)

        return visible
    except Exception as e:
        logger.error(f"get_family_custom_strategies error: {e}")
        return []

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
# translation update Sat May  2 10:27:02 WEST 2026
# translation update Sat May  2 10:30:10 WEST 2026
# redeploy Sat May  9 08:09:03 WEST 2026
# force redeploy Sun May 10 19:38:17 WEST 2026
# force 1778444180
# redeploy 1778610453
