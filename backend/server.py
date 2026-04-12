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
        "zone": "blue",
        "color": "#4FC3F7",
        "description": "A calm water creature that helps when you feel tired or sad",
        "anim_style": "swim",
        "emoji_stages": ["🐟", "🐬", "🦈", "🐋"],
        "stages": [
            {"stage": 0, "name": "Bubby", "emoji": "🐟", "description": "A tiny fish friend just hatched! Help it grow by checking in!", "required_points": 0},
            {"stage": 1, "name": "Splashy", "emoji": "🐬", "description": "A playful dolphin doing flips and jumps! Loves the ocean!", "required_points": 25},
            {"stage": 2, "name": "Wavey", "emoji": "🦈", "description": "A brave shark surfing the biggest waves! Strong and cool!", "required_points": 60},
            {"stage": 3, "name": "Ocean King", "emoji": "🐋", "description": "The mighty whale! Guardian of all the oceans! You evolved it!", "required_points": 120}
        ],
        "moves": [
            {"id": "bubble_pop", "name": "Bubble Pop", "emoji": "🫧", "unlocks_at_stage": 1, "description": "Blows a stream of magical bubbles that pop with sparkles!"},
            {"id": "water_spray", "name": "Water Spray", "emoji": "💦", "unlocks_at_stage": 1, "description": "Shoots a massive water spray soaking everything in sight!"},
            {"id": "hydro_jet", "name": "Hydro Jet", "emoji": "🚀", "unlocks_at_stage": 2, "description": "Launches through the water like a rocket! Super speed!"},
            {"id": "surf_wave", "name": "Surf the Wave", "emoji": "🏄", "unlocks_at_stage": 3, "description": "Rides the biggest wave in the ocean! Total legend!"}
        ],
        "outfits": [
            {"id": "swimmers", "name": "Cool Swimmers", "emoji": "🩱", "unlocks_at_stage": 1, "description": "Bright colourful swimmers for ocean adventures!"},
            {"id": "goggles", "name": "Dive Goggles", "emoji": "🥽", "unlocks_at_stage": 2, "description": "Super cool goggles to see underwater!"},
            {"id": "beanie", "name": "Cosy Beanie", "emoji": "🧢", "unlocks_at_stage": 2, "description": "A warm beanie for cold ocean days!"},
            {"id": "wetsuit", "name": "Surf Jacket", "emoji": "🧥", "unlocks_at_stage": 3, "description": "A legendary surf jacket for the Ocean King!"}
        ],
        "foods": [
            {"id": "coral_snack", "name": "Coral Snack", "emoji": "🪸", "unlocks_at_stage": 1, "description": "Crunchy coral pieces from the reef - delicious!"},
            {"id": "prawns", "name": "Juicy Prawns", "emoji": "🦐", "unlocks_at_stage": 1, "description": "Fresh prawns from the ocean floor - yum!"},
            {"id": "ocean_chips", "name": "Ocean Chips", "emoji": "🍟", "unlocks_at_stage": 2, "description": "Salty ocean-flavoured junk food chips!"},
            {"id": "mini_fish", "name": "Mini Fish", "emoji": "🐠", "unlocks_at_stage": 2, "description": "Tiny colourful fish - a favourite snack!"},
            {"id": "spicy_tuna", "name": "Spicy Tuna Roll", "emoji": "🍣", "unlocks_at_stage": 3, "description": "The spiciest tuna roll in the whole ocean!"}
        ],
        "homes": [
            {"id": "tide_pool", "name": "Tide Pool", "emoji": "🏊", "unlocks_at_stage": 1, "description": "A cosy rock pool home with warm shallow water"},
            {"id": "coral_reef", "name": "Coral Reef", "emoji": "🪸", "unlocks_at_stage": 2, "description": "A beautiful colourful coral reef home"},
            {"id": "ocean_palace", "name": "Ocean Palace", "emoji": "🏰", "unlocks_at_stage": 3, "description": "A magnificent underwater palace fit for the Ocean King!"}
        ]
    },
    {
        "id": "leaf_friend",
        "name": "Leaf Friend",
        "feeling_colour": "green",
        "zone": "green",
        "color": "#81C784",
        "description": "A balanced nature creature that celebrates feeling happy and calm",
        "anim_style": "hop",
        "emoji_stages": ["🐸", "🐢", "🦎", "🦖"],
        "stages": [
            {"stage": 0, "name": "Sproutie", "emoji": "🐸", "description": "A happy little frog who loves jumping in puddles! So cheerful!", "required_points": 0},
            {"stage": 1, "name": "Hoppy", "emoji": "🐢", "description": "A wise turtle growing stronger every day! Slow and steady!", "required_points": 25},
            {"stage": 2, "name": "Leafy", "emoji": "🦎", "description": "A super cool chameleon who changes colours! Nature ninja!", "required_points": 60},
            {"stage": 3, "name": "Forest King", "emoji": "🦖", "description": "THE LEGENDARY FOREST DINOSAUR! King of all nature!", "required_points": 120}
        ],
        "moves": [
            {"id": "skateboard", "name": "Skateboard Tricks", "emoji": "🛹", "unlocks_at_stage": 1, "description": "Frog does epic skateboard tricks through the forest!"},
            {"id": "rollerblade", "name": "Rollerblading", "emoji": "⛸️", "unlocks_at_stage": 1, "description": "Turtle blades through the park at top speed!"},
            {"id": "plant_munch", "name": "Plant Munch", "emoji": "🌿", "unlocks_at_stage": 2, "description": "Chomps through a massive pile of plants - CHOMP!"},
            {"id": "mountain_climb", "name": "Volcano Climb", "emoji": "🌋", "unlocks_at_stage": 3, "description": "The Forest King climbs all the way to the top of a volcano!"}
        ],
        "outfits": [
            {"id": "flower_hat", "name": "Flower Hat", "emoji": "👒", "unlocks_at_stage": 1, "description": "A cute hat decorated with fresh garden flowers!"},
            {"id": "nature_beanie", "name": "Leaf Beanie", "emoji": "🧢", "unlocks_at_stage": 2, "description": "A cosy beanie woven from the softest forest leaves!"},
            {"id": "flower_crown", "name": "Flower Crown", "emoji": "💐", "unlocks_at_stage": 2, "description": "A gorgeous crown made from wildflowers!"},
            {"id": "rainbow_cape", "name": "Rainbow Cape", "emoji": "🌈", "unlocks_at_stage": 3, "description": "A magical rainbow cape for the Forest King!"}
        ],
        "foods": [
            {"id": "fresh_leaves", "name": "Fresh Leaves", "emoji": "🍃", "unlocks_at_stage": 1, "description": "Crispy fresh leaves picked from the tallest tree!"},
            {"id": "sunny_apple", "name": "Sunny Apple", "emoji": "🍎", "unlocks_at_stage": 1, "description": "A bright red apple straight from the orchard!"},
            {"id": "golden_honey", "name": "Golden Honey", "emoji": "🍯", "unlocks_at_stage": 2, "description": "The sweetest golden honey from forest bees!"},
            {"id": "forest_berries", "name": "Forest Berries", "emoji": "🫐", "unlocks_at_stage": 2, "description": "Wild berries bursting with forest flavour!"},
            {"id": "dino_cake", "name": "Dino Birthday Cake", "emoji": "🎂", "unlocks_at_stage": 3, "description": "A massive dinosaur birthday cake - RAWR! 🦖"}
        ],
        "homes": [
            {"id": "lily_pad", "name": "Lily Pad", "emoji": "🪷", "unlocks_at_stage": 1, "description": "A bouncy lily pad floating on a calm pond!"},
            {"id": "mushroom_house", "name": "Mushroom House", "emoji": "🍄", "unlocks_at_stage": 2, "description": "A cosy home inside a giant red mushroom!"},
            {"id": "treehouse", "name": "Magical Treehouse", "emoji": "🏡", "unlocks_at_stage": 3, "description": "An epic treehouse high in the oldest forest tree!"}
        ]
    },
    {
        "id": "spark_pal",
        "name": "Spark Pal",
        "feeling_colour": "yellow",
        "zone": "yellow",
        "color": "#FFD54F",
        "description": "An energetic electric creature that helps with big feelings of excitement or worry",
        "anim_style": "zap",
        "emoji_stages": ["🐱", "🐯", "🦁", "🦄"],
        "stages": [
            {"stage": 0, "name": "Zippy", "emoji": "🐱", "description": "An energetic electric kitten - SCRATCH SCRATCH! Full of zoomies!", "required_points": 0},
            {"stage": 1, "name": "Zappy", "emoji": "🐯", "description": "A stripy tiger who LOVES climbing trees! So fast!", "required_points": 25},
            {"stage": 2, "name": "Bolty", "emoji": "🦁", "description": "A magnificent lion standing at the top of Pride Rock! ROAR!", "required_points": 60},
            {"stage": 3, "name": "Thunder King", "emoji": "🦄", "description": "The magical glitter unicorn flying over RAINBOWS! Pure magic!", "required_points": 120}
        ],
        "moves": [
            {"id": "kitty_scratch", "name": "Kitty Scratch", "emoji": "😸", "unlocks_at_stage": 1, "description": "Zippy scratches everything with electric claws - ZAP ZAP!"},
            {"id": "tree_climb", "name": "Tree Climb", "emoji": "🌴", "unlocks_at_stage": 1, "description": "Zappy the tiger climbs to the very top of the tallest tree!"},
            {"id": "pride_rock", "name": "Pride Rock Roar", "emoji": "🦁", "unlocks_at_stage": 2, "description": "Bolty stands at the top of Pride Rock and ROARS at the world!"},
            {"id": "rainbow_fly", "name": "Rainbow Glitter Fly", "emoji": "🌈✨", "unlocks_at_stage": 3, "description": "Thunder King flies over rainbows shooting GLITTER everywhere!"}
        ],
        "outfits": [
            {"id": "pyjamas", "name": "Cosy Pyjamas", "emoji": "🩲", "unlocks_at_stage": 1, "description": "The comfiest pyjamas for snuggling up after a big day!"},
            {"id": "beach_outfit", "name": "Beach Clothes", "emoji": "🏖️", "unlocks_at_stage": 2, "description": "Cool beach clothes for sunny electric adventures!"},
            {"id": "winter_coat", "name": "Winter Coat", "emoji": "🧤", "unlocks_at_stage": 2, "description": "A warm winter coat and gloves for cold adventures!"},
            {"id": "star_armor", "name": "Star Armour", "emoji": "⭐", "unlocks_at_stage": 3, "description": "Legendary star armour for the Thunder King!"}
        ],
        "foods": [
            {"id": "electric_candy", "name": "Electric Candy", "emoji": "🍬", "unlocks_at_stage": 1, "description": "Candy that crackles and pops on your tongue!"},
            {"id": "tiger_snack", "name": "Tiger Crunch", "emoji": "🥨", "unlocks_at_stage": 1, "description": "Crunchy snacks that give you tiger energy!"},
            {"id": "lion_feast", "name": "Lion Feast", "emoji": "🥩", "unlocks_at_stage": 2, "description": "A massive feast fit for a lion at Pride Rock!"},
            {"id": "rainbow_icecream", "name": "Rainbow Ice Cream", "emoji": "🍦", "unlocks_at_stage": 2, "description": "Magical rainbow ice cream with every flavour!"},
            {"id": "glitter_cake", "name": "Glitter Unicorn Cake", "emoji": "🎂", "unlocks_at_stage": 3, "description": "The most magical glittery unicorn cake ever baked!"}
        ],
        "homes": [
            {"id": "cat_tree", "name": "Cat Play Tree", "emoji": "🏠", "unlocks_at_stage": 1, "description": "A massive cat tree with scratching posts and tunnels!"},
            {"id": "jungle_den", "name": "Jungle Den", "emoji": "🌴", "unlocks_at_stage": 2, "description": "A cool den hidden deep in the electric jungle!"},
            {"id": "star_castle", "name": "Star Castle", "emoji": "🏯", "unlocks_at_stage": 3, "description": "A sparkling castle in the clouds built from stars!"}
        ]
    },
    {
        "id": "blaze_heart",
        "name": "Blaze Heart",
        "feeling_colour": "red",
        "zone": "red",
        "color": "#FF7043",
        "description": "A powerful fire creature that helps transform big angry or frustrated feelings into strength",
        "anim_style": "flicker",
        "emoji_stages": ["🐕", "🐺", "🦊", "🐉"],
        "stages": [
            {"stage": 0, "name": "Flamey", "emoji": "🐕", "description": "A brave little puppy with a warm heart! Super JUMP!", "required_points": 0},
            {"stage": 1, "name": "Blaze", "emoji": "🐺", "description": "A powerful wolf who HOWLS with wind force! Ahoooooo!", "required_points": 25},
            {"stage": 2, "name": "Inferno", "emoji": "🦊", "description": "A clever fox with a FLAMETHROWER tail! Lights fires to help people!", "required_points": 60},
            {"stage": 3, "name": "Fire King", "emoji": "🐉", "description": "THE LEGENDARY FIRE DRAGON! Shoots fireworks from its mouth!", "required_points": 120}
        ],
        "moves": [
            {"id": "super_jump", "name": "Super Jump", "emoji": "⬆️", "unlocks_at_stage": 1, "description": "Flamey jumps SO HIGH it almost touches the clouds! BOING!"},
            {"id": "wolf_howl", "name": "Wind Howl", "emoji": "🌬️", "unlocks_at_stage": 1, "description": "Blaze howls SO LOUD it creates a super power wind force!"},
            {"id": "flamethrower", "name": "Flamethrower", "emoji": "🔥", "unlocks_at_stage": 2, "description": "Inferno shoots flames to light campfires and help people stay warm!"},
            {"id": "fireworks", "name": "Dragon Fireworks", "emoji": "🎆", "unlocks_at_stage": 3, "description": "Fire King breathes FIREWORKS from its mouth! Spectacular!"}
        ],
        "outfits": [
            {"id": "stick_house_hat", "name": "Straw Hat", "emoji": "🎩", "unlocks_at_stage": 1, "description": "A simple straw hat - like a house of sticks, humble beginnings!"},
            {"id": "brick_armour", "name": "Brick Armour", "emoji": "🧱", "unlocks_at_stage": 2, "description": "Strong brick armour - nothing can knock this down!"},
            {"id": "flame_cape", "name": "Flame Cape", "emoji": "🧥", "unlocks_at_stage": 2, "description": "A magnificent cape made of dancing flames!"},
            {"id": "dragon_crown", "name": "Dragon Crown", "emoji": "👑", "unlocks_at_stage": 3, "description": "A legendary golden crown for the Fire King Dragon!"}
        ],
        "foods": [
            {"id": "spicy_pepper", "name": "Spicy Pepper", "emoji": "🌶️", "unlocks_at_stage": 1, "description": "The hottest pepper in the world - FIRE in your belly!"},
            {"id": "bbq_feast", "name": "BBQ Feast", "emoji": "🍖", "unlocks_at_stage": 1, "description": "A massive BBQ feast cooked over Flamey's fire!"},
            {"id": "fire_crystals", "name": "Fire Crystals", "emoji": "💎", "unlocks_at_stage": 2, "description": "Beautiful crystals that glow and crackle like fire!"},
            {"id": "dragon_chilli", "name": "Dragon Chilli", "emoji": "🫕", "unlocks_at_stage": 2, "description": "A legendary pot of dragon chilli that steams and bubbles!"},
            {"id": "firework_cake", "name": "Firework Cake", "emoji": "🎆", "unlocks_at_stage": 3, "description": "A spectacular cake with REAL sparkler fireworks on top!"}
        ],
        "homes": [
            {"id": "stick_house", "name": "Stick House", "emoji": "🏚️", "unlocks_at_stage": 1, "description": "A cosy little house made from sticks - warm inside!"},
            {"id": "brick_house", "name": "Brick House", "emoji": "🏠", "unlocks_at_stage": 2, "description": "A strong brick house - nothing can blow this down!"},
            {"id": "golden_palace", "name": "Golden Palace", "emoji": "🏰", "unlocks_at_stage": 3, "description": "A MAGNIFICENT golden palace with fire torches everywhere!"}
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


TRANSLATED_HELPERS = {
    "es": {
        "blue": [
            {"id": "blue_1", "name": "Estiramiento Suave", "description": "Estira lentamente tus brazos y piernas", "icon": "accessibility", "feeling_colour": "blue"},
            {"id": "blue_2", "name": "Bebida Caliente", "description": "Toma un vaso de agua caliente", "icon": "local-cafe", "feeling_colour": "blue"},
            {"id": "blue_3", "name": "Canción Favorita", "description": "Escucha tu canción favorita", "icon": "music-note", "feeling_colour": "blue"},
            {"id": "blue_4", "name": "Lugar Cómodo", "description": "Encuentra un lugar cómodo y acogedor", "icon": "weekend", "feeling_colour": "blue"},
            {"id": "blue_5", "name": "Cuéntaselo a Alguien", "description": "Cuéntale a alguien de confianza cómo te sientes", "icon": "chat", "feeling_colour": "blue"},
            {"id": "blue_6", "name": "Respiración Lenta", "description": "Toma 3 respiraciones lentas y profundas", "icon": "air", "feeling_colour": "blue"},
        ],
        "green": [
            {"id": "green_1", "name": "¡Sigue Adelante!", "description": "Lo estás haciendo genial - ¡sigue así!", "icon": "star", "feeling_colour": "green"},
            {"id": "green_2", "name": "Ayuda a un Amigo", "description": "Ofrécete a ayudar a alguien cercano", "icon": "people", "feeling_colour": "green"},
            {"id": "green_3", "name": "Prueba Algo Nuevo", "description": "Este es un buen momento para aprender", "icon": "lightbulb", "feeling_colour": "green"},
            {"id": "green_4", "name": "Comparte tu Sonrisa", "description": "Sonríe a alguien que esté cerca", "icon": "sentiment-satisfied", "feeling_colour": "green"},
            {"id": "green_5", "name": "Establece una Meta", "description": "Piensa en algo que quieras hacer hoy", "icon": "flag", "feeling_colour": "green"},
            {"id": "green_6", "name": "Gratitud", "description": "Piensa en algo por lo que estés agradecido", "icon": "favorite", "feeling_colour": "green"},
        ],
        "yellow": [
            {"id": "yellow_1", "name": "Respiración de Burbujas", "description": "Inspira lentamente, espira como soplando burbujas", "icon": "bubble-chart", "feeling_colour": "yellow"},
            {"id": "yellow_2", "name": "Sacudir el Cuerpo", "description": "Sacude los nervios de tu cuerpo", "icon": "directions-run", "feeling_colour": "yellow"},
            {"id": "yellow_3", "name": "Contar hasta 10", "description": "Cuenta lentamente del 1 al 10", "icon": "format-list-numbered", "feeling_colour": "yellow"},
            {"id": "yellow_4", "name": "5 Sentidos", "description": "Nombra 5 cosas que puedas ver a tu alrededor", "icon": "visibility", "feeling_colour": "yellow"},
            {"id": "yellow_5", "name": "Apretar y Soltar", "description": "Aprieta las manos fuerte y luego suelta", "icon": "pan-tool", "feeling_colour": "yellow"},
            {"id": "yellow_6", "name": "Habla de Ello", "description": "Cuéntale a un adulto de confianza cómo te sientes", "icon": "record-voice-over", "feeling_colour": "yellow"},
        ],
        "red": [
            {"id": "red_1", "name": "Congelarse", "description": "Para y congela completamente tu cuerpo", "icon": "pause-circle-filled", "feeling_colour": "red"},
            {"id": "red_2", "name": "Respiraciones Grandes", "description": "Toma 5 respiraciones muy lentas y profundas", "icon": "air", "feeling_colour": "red"},
            {"id": "red_3", "name": "Contar al Revés", "description": "Cuenta lentamente del 10 al 1", "icon": "exposure-neg-1", "feeling_colour": "red"},
            {"id": "red_4", "name": "Espacio Seguro", "description": "Ve a tu rincón tranquilo", "icon": "king-bed", "feeling_colour": "red"},
            {"id": "red_5", "name": "Pide Ayuda", "description": "Dile a un adulto de confianza que necesitas apoyo", "icon": "support-agent", "feeling_colour": "red"},
            {"id": "red_6", "name": "Abrazo Propio", "description": "Date un abrazo grande y cálido", "icon": "favorite-border", "feeling_colour": "red"},
        ],
            "tired": "Cansado",
        "sad": "Triste",
        "lonely": "Solo",
        "need_rest": "Necesito descansar",
        "calm": "Tranquilo",
        "happy": "Feliz",
        "focused": "Concentrado",
        "ready_to_learn": "Listo para aprender",
        "silly": "Tonto",
        "frustrated": "Frustrado",
        "worried": "Preocupado",
        "butterflies": "Mariposas",
        "super_charged": "Súper Cargado",
        "very_upset": "Muy Alterado",
        "out_of_control": "Fuera de Control",
        "explosive": "Explosivo",
        "what_colours_mean": "¿Qué significan los colores?",
        "need_help": "¿Necesitas ayuda? ¡Toca aquí!",
        "support_message": "Siempre puedes pedir ayuda a un adulto",
        "hi": "Hola",
    },
    "fr": {
        "blue": [
            {"id": "blue_1", "name": "Étirement Doux", "description": "Étire lentement tes bras et tes jambes", "icon": "accessibility", "feeling_colour": "blue"},
            {"id": "blue_2", "name": "Boisson Chaude", "description": "Prends un verre d'eau chaude", "icon": "local-cafe", "feeling_colour": "blue"},
            {"id": "blue_3", "name": "Chanson Préférée", "description": "Écoute ta chanson préférée", "icon": "music-note", "feeling_colour": "blue"},
            {"id": "blue_4", "name": "Endroit Confortable", "description": "Trouve un endroit confortable et douillet", "icon": "weekend", "feeling_colour": "blue"},
            {"id": "blue_5", "name": "Parle à Quelqu\'un", "description": "Dis à quelqu\'un de confiance comment tu te sens", "icon": "chat", "feeling_colour": "blue"},
            {"id": "blue_6", "name": "Respiration Lente", "description": "Prends 3 respirations lentes et profondes", "icon": "air", "feeling_colour": "blue"},
        ],
        "green": [
            {"id": "green_1", "name": "Continue!", "description": "Tu te débrouilles bien - continue!", "icon": "star", "feeling_colour": "green"},
            {"id": "green_2", "name": "Aide un Ami", "description": "Propose d\'aider quelqu\'un à côté", "icon": "people", "feeling_colour": "green"},
            {"id": "green_3", "name": "Essaie Quelque Chose", "description": "C\'est un bon moment pour apprendre", "icon": "lightbulb", "feeling_colour": "green"},
            {"id": "green_4", "name": "Partage ton Sourire", "description": "Souris à quelqu\'un autour de toi", "icon": "sentiment-satisfied", "feeling_colour": "green"},
            {"id": "green_5", "name": "Fixe un Objectif", "description": "Pense à quelque chose que tu veux faire", "icon": "flag", "feeling_colour": "green"},
            {"id": "green_6", "name": "Gratitude", "description": "Pense à une chose pour laquelle tu es reconnaissant", "icon": "favorite", "feeling_colour": "green"},
        ],
        "yellow": [
            {"id": "yellow_1", "name": "Respiration Bulles", "description": "Inspire lentement, expire comme soufflant des bulles", "icon": "bubble-chart", "feeling_colour": "yellow"},
            {"id": "yellow_2", "name": "Secouer le Corps", "description": "Secoue les frissons de ton corps", "icon": "directions-run", "feeling_colour": "yellow"},
            {"id": "yellow_3", "name": "Compter jusqu\'à 10", "description": "Compte lentement de 1 à 10", "icon": "format-list-numbered", "feeling_colour": "yellow"},
            {"id": "yellow_4", "name": "5 Sens", "description": "Nomme 5 choses que tu vois autour de toi", "icon": "visibility", "feeling_colour": "yellow"},
            {"id": "yellow_5", "name": "Serrer et Relâcher", "description": "Serre tes mains fort puis relâche", "icon": "pan-tool", "feeling_colour": "yellow"},
            {"id": "yellow_6", "name": "Parles-en", "description": "Dis à un adulte de confiance comment tu te sens", "icon": "record-voice-over", "feeling_colour": "yellow"},
        ],
        "red": [
            {"id": "red_1", "name": "Se Figer", "description": "Arrête et fige complètement ton corps", "icon": "pause-circle-filled", "feeling_colour": "red"},
            {"id": "red_2", "name": "Grandes Respirations", "description": "Prends 5 respirations très lentes et profondes", "icon": "air", "feeling_colour": "red"},
            {"id": "red_3", "name": "Compter à Rebours", "description": "Compte lentement de 10 à 1", "icon": "exposure-neg-1", "feeling_colour": "red"},
            {"id": "red_4", "name": "Espace Sûr", "description": "Va dans ton coin calme", "icon": "king-bed", "feeling_colour": "red"},
            {"id": "red_5", "name": "Demande de l\'Aide", "description": "Dis à un adulte de confiance que tu as besoin de soutien", "icon": "support-agent", "feeling_colour": "red"},
            {"id": "red_6", "name": "Câlin à Soi-Même", "description": "Donne-toi un grand câlin chaleureux", "icon": "favorite-border", "feeling_colour": "red"},
        ],
    },
    "pt": {
        "blue": [
            {"id": "blue_1", "name": "Alongamento Suave", "description": "Alonga lentamente os teus braços e pernas", "icon": "accessibility", "feeling_colour": "blue"},
            {"id": "blue_2", "name": "Bebida Quente", "description": "Bebe um copo de água quente", "icon": "local-cafe", "feeling_colour": "blue"},
            {"id": "blue_3", "name": "Música Favorita", "description": "Ouve a tua música favorita", "icon": "music-note", "feeling_colour": "blue"},
            {"id": "blue_4", "name": "Lugar Confortável", "description": "Encontra um lugar confortável e aconchegante", "icon": "weekend", "feeling_colour": "blue"},
            {"id": "blue_5", "name": "Conta a Alguém", "description": "Conta a alguém de confiança como te sentes", "icon": "chat", "feeling_colour": "blue"},
            {"id": "blue_6", "name": "Respiração Lenta", "description": "Faz 3 respirações lentas e profundas", "icon": "air", "feeling_colour": "blue"},
        ],
        "green": [
            {"id": "green_1", "name": "Continua!", "description": "Estás a ir muito bem - continua!", "icon": "star", "feeling_colour": "green"},
            {"id": "green_2", "name": "Ajuda um Amigo", "description": "Oferece-te para ajudar alguém", "icon": "people", "feeling_colour": "green"},
            {"id": "green_3", "name": "Experimenta Algo Novo", "description": "Este é um ótimo momento para aprender", "icon": "lightbulb", "feeling_colour": "green"},
            {"id": "green_4", "name": "Partilha o Teu Sorriso", "description": "Sorri para alguém à tua volta", "icon": "sentiment-satisfied", "feeling_colour": "green"},
            {"id": "green_5", "name": "Define um Objetivo", "description": "Pensa em algo que queiras fazer hoje", "icon": "flag", "feeling_colour": "green"},
            {"id": "green_6", "name": "Gratidão", "description": "Pensa numa coisa pela qual és grato", "icon": "favorite", "feeling_colour": "green"},
        ],
        "yellow": [
            {"id": "yellow_1", "name": "Respiração de Bolhas", "description": "Inspira devagar, expira como soprando bolhas", "icon": "bubble-chart", "feeling_colour": "yellow"},
            {"id": "yellow_2", "name": "Sacudir o Corpo", "description": "Sacude os nervos do teu corpo", "icon": "directions-run", "feeling_colour": "yellow"},
            {"id": "yellow_3", "name": "Contar até 10", "description": "Conta devagar de 1 a 10", "icon": "format-list-numbered", "feeling_colour": "yellow"},
            {"id": "yellow_4", "name": "5 Sentidos", "description": "Nomeia 5 coisas que podes ver à tua volta", "icon": "visibility", "feeling_colour": "yellow"},
            {"id": "yellow_5", "name": "Apertar e Soltar", "description": "Aperta as mãos com força e depois solta", "icon": "pan-tool", "feeling_colour": "yellow"},
            {"id": "yellow_6", "name": "Fala Sobre Isso", "description": "Conta a um adulto de confiança como te sentes", "icon": "record-voice-over", "feeling_colour": "yellow"},
        ],
        "red": [
            {"id": "red_1", "name": "Congelar", "description": "Para e congela completamente o teu corpo", "icon": "pause-circle-filled", "feeling_colour": "red"},
            {"id": "red_2", "name": "Respirações Profundas", "description": "Faz 5 respirações muito lentas e profundas", "icon": "air", "feeling_colour": "red"},
            {"id": "red_3", "name": "Contar ao Contrário", "description": "Conta devagar de 10 a 1", "icon": "exposure-neg-1", "feeling_colour": "red"},
            {"id": "red_4", "name": "Espaço Seguro", "description": "Vai para o teu canto tranquilo", "icon": "king-bed", "feeling_colour": "red"},
            {"id": "red_5", "name": "Pede Ajuda", "description": "Diz a um adulto de confiança que precisas de apoio", "icon": "support-agent", "feeling_colour": "red"},
            {"id": "red_6", "name": "Abraço a Si Mesmo", "description": "Dá a ti mesmo um grande abraço caloroso", "icon": "favorite-border", "feeling_colour": "red"},
        ],
    },
    "de": {
        "blue": [
            {"id": "blue_1", "name": "Sanftes Dehnen", "description": "Dehne langsam deine Arme und Beine", "icon": "accessibility", "feeling_colour": "blue"},
            {"id": "blue_2", "name": "Warmes Getränk", "description": "Trink ein Glas warmes Wasser", "icon": "local-cafe", "feeling_colour": "blue"},
            {"id": "blue_3", "name": "Lieblingslied", "description": "Höre dein Lieblingslied", "icon": "music-note", "feeling_colour": "blue"},
            {"id": "blue_4", "name": "Gemütlicher Platz", "description": "Finde einen bequemen, gemütlichen Platz", "icon": "weekend", "feeling_colour": "blue"},
            {"id": "blue_5", "name": "Jemandem Erzählen", "description": "Erzähle einer Vertrauensperson wie du dich fühlst", "icon": "chat", "feeling_colour": "blue"},
            {"id": "blue_6", "name": "Langsames Atmen", "description": "Nimm 3 langsame, tiefe Atemzüge", "icon": "air", "feeling_colour": "blue"},
        ],
        "green": [
            {"id": "green_1", "name": "Weitermachen!", "description": "Du machst das großartig - weiter so!", "icon": "star", "feeling_colour": "green"},
            {"id": "green_2", "name": "Einem Freund Helfen", "description": "Biete an, jemandem in der Nähe zu helfen", "icon": "people", "feeling_colour": "green"},
            {"id": "green_3", "name": "Etwas Neues Versuchen", "description": "Das ist eine tolle Zeit zum Lernen", "icon": "lightbulb", "feeling_colour": "green"},
            {"id": "green_4", "name": "Dein Lächeln Teilen", "description": "Lächle jemanden um dich herum an", "icon": "sentiment-satisfied", "feeling_colour": "green"},
            {"id": "green_5", "name": "Ein Ziel Setzen", "description": "Denk an etwas, das du heute tun möchtest", "icon": "flag", "feeling_colour": "green"},
            {"id": "green_6", "name": "Dankbarkeit", "description": "Denk an eine Sache, für die du dankbar bist", "icon": "favorite", "feeling_colour": "green"},
        ],
        "yellow": [
            {"id": "yellow_1", "name": "Blasen-Atmung", "description": "Langsam einatmen, ausatmen wie Blasen pusten", "icon": "bubble-chart", "feeling_colour": "yellow"},
            {"id": "yellow_2", "name": "Körper Schütteln", "description": "Schüttle die Wibbel aus deinem Körper", "icon": "directions-run", "feeling_colour": "yellow"},
            {"id": "yellow_3", "name": "Bis 10 Zählen", "description": "Zähle langsam von 1 bis 10", "icon": "format-list-numbered", "feeling_colour": "yellow"},
            {"id": "yellow_4", "name": "5 Sinne", "description": "Nenne 5 Dinge, die du um dich herum siehst", "icon": "visibility", "feeling_colour": "yellow"},
            {"id": "yellow_5", "name": "Drücken und Loslassen", "description": "Drücke deine Hände fest und lass dann los", "icon": "pan-tool", "feeling_colour": "yellow"},
            {"id": "yellow_6", "name": "Darüber Reden", "description": "Erzähle einem Erwachsenen wie du dich fühlst", "icon": "record-voice-over", "feeling_colour": "yellow"},
        ],
        "red": [
            {"id": "red_1", "name": "Einfrieren", "description": "Stopp und friere deinen Körper komplett ein", "icon": "pause-circle-filled", "feeling_colour": "red"},
            {"id": "red_2", "name": "Große Atemzüge", "description": "Nimm 5 sehr langsame, tiefe Atemzüge", "icon": "air", "feeling_colour": "red"},
            {"id": "red_3", "name": "Rückwärts Zählen", "description": "Zähle langsam von 10 bis 1", "icon": "exposure-neg-1", "feeling_colour": "red"},
            {"id": "red_4", "name": "Sicherer Ort", "description": "Gehe in deine ruhige Ecke", "icon": "king-bed", "feeling_colour": "red"},
            {"id": "red_5", "name": "Um Hilfe Bitten", "description": "Sage einer Vertrauensperson, dass du Unterstützung brauchst", "icon": "support-agent", "feeling_colour": "red"},
            {"id": "red_6", "name": "Sich Selbst Umarmen", "description": "Gib dir selbst eine große, warme Umarmung", "icon": "favorite-border", "feeling_colour": "red"},
        ],
    },
        "it": {
        "blue": [
            {"id": "blue_1", "name": "Stiramento Dolce", "description": "Stira lentamente le tue braccia e gambe", "icon": "accessibility", "feeling_colour": "blue"},
            {"id": "blue_2", "name": "Bevanda Calda", "description": "Bevi un bicchiere d acqua calda", "icon": "local-cafe", "feeling_colour": "blue"},
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
        "red_description": "Tu cuerpo tiene grandes sentimientos ahora mismo. Puedes sentirte muy alterado o fuera de control.",
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
        "hi": "Hola",
        "need_help": "¿Necesitas ayuda? ¡Toca aquí!",
        "support_message": "Siempre puedes pedir ayuda a un adulto o amigos",
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
        "tap_strategies_help": "Toca para seleccionar ayudantes que podrían ayudar:",
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
        "next_evolution": "Próxima Evolución",
        "points_needed": "puntos necesarios",
        "create_new_classroom": "Crear Nueva Clase",
        "classroom_name": "Nombre de la Clase",
        "create_classroom": "Crear Clase",
        "creating": "Creando...",
        "no_classrooms_yet": "Sin clases aún",
        "create_classroom_organize": "Crea una clase para organizar tus estudiantes",
        "share_with_parent": "Compartir con Padre",
        "generate_code": "Generar Código",
        "generating": "Generando...",
        "parent_link_code": "Código para Padres:",
        "code_expires_7_days": "Este código expira en 7 días.",
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
        "view_progress": "Ver progreso de estudiantes",
        "loading": "Cargando...",
        "save": "Guardar",
        "cancel": "Cancelar",
        "delete": "Eliminar",
        "edit": "Editar",
        "back": "Atrás",
        "next": "Siguiente",
        "done": "Hecho",
        "skip": "Omitir",
        "error": "Algo salió mal",
        "add_profile": "Agregar Perfil",
        "days_7": "7 Días",
        "days_14": "2 Semanas",
        "days_30": "30 Días",
        "no_students_yet": "Sin estudiantes aún",
        "add_new_student": "Agregar Estudiante",
        "download_report": "Descargar Informe",
        "confirm_logout": "¿Estás seguro de que quieres cerrar sesión?",
        "free_trial": "Prueba Gratis",
        "subscribe": "Suscribirse",
        "sign_in_google": "Iniciar sesión con Google",
        "have_trial_code": "¿Tienes un código de prueba?",
        "enter_trial_code": "Ingresar Código de Prueba",
        "trial_code_placeholder": "Ingresa tu código aquí",
        "redeem_code": "Canjear Código",
        "redeeming": "Canjeando...",
        "trial_code_success": "¡Código de prueba canjeado con éxito!",
        "trial_code_invalid": "Código de prueba inválido",
    },
    "fr": {
        "app_name": "Classe du Bonheur",
        "how_are_you_feeling": "Comment te sens-tu?",
        "tap_colour_help": "Appuie sur la couleur qui correspond à ton ressenti",
        "choose_helpers": "Choisis tes aides",
        "want_to_say": "Tu veux dire comment tu te sens?",
        "write_sentence": "Écris une phrase sur comment tu te sens...",
        "save_checkin": "Enregistrer",
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
        "blue_description": "Ton corps bouge lentement. Tu te sens peut-être fatigué, un peu triste, ou tu as besoin de repos.",
        "green_description": "Tu te sens calme, heureux et prêt. C'est un super sentiment!",
        "yellow_description": "Tu commences à te sentir instable. Tu peux être bête, inquiet ou frustré.",
        "red_description": "Ton corps a de grands sentiments maintenant. Tu peux te sentir très bouleversé.",
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
        "tap_to_check_in": "Appuie sur ta photo pour t'enregistrer!",
        "add_profile": "Ajouter un Profil",
        "loading_helpers": "Chargement des aides...",
        "loading_strategies": "Chargement des aides...",
        "green_zone_help": "Super! Voici des façons de continuer à te sentir bien:",
        "other_zone_help": "Voici des aides qui pourraient t'aider:",
        "tap_helpers_green": "Appuie sur les aides que tu aimerais essayer:",
        "tap_helpers_other": "Appuie pour sélectionner des aides:",
        "tap_strategies_green": "Appuie sur les aides que tu aimerais essayer:",
        "tap_strategies_help": "Appuie pour sélectionner des aides:",
        "great_job_title": "Travail Incroyable!",
        "keep_it_up": "Continue comme ça!",
        "streak_bonus": "bonus de série!",
        "day_streak": "jours consécutifs!",
        "points": "Points",
        "continue": "Continuer",
        "loading_creature": "Chargement de ta créature...",
        "more_points_until": "points de plus jusqu'à ce que",
        "evolves": "évolue!",
        "collected": "Collectionnés",
        "current_friend": "Ami Actuel",
        "fully_evolved": "Entièrement Évolué!",
        "keep_growing": "Continue à Grandir!",
        "grow_creature_hint": "Utilise des aides et partage tes sentiments pour faire évoluer ta créature!",
        "complete": "Terminé!",
        "evolved": "ÉVOLUÉ!",
        "evolving": "EN ÉVOLUTION...",
        "amazing_continue": "Incroyable! Continuer",
        "moves": "Mouvements",
        "outfits": "Tenues",
        "foods": "Nourriture",
        "homes": "Maisons",
        "bonus_items": "Objets Bonus",
        "your_creature": "Ta Créature",
        "creature_collection": "Ma Collection de Créatures",
        "stage": "Étape",
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
        "check_in_feelings": "Enregistrer mes sentiments",
        "view_progress": "Voir les progrès",
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
        "confirm_logout": "Es-tu sûr de vouloir te déconnecter?",
        "free_trial": "Essai Gratuit",
        "subscribe": "S'abonner",
        "sign_in_google": "Se connecter avec Google",
        "have_trial_code": "Tu as un code d'essai?",
        "enter_trial_code": "Entrer le Code d'Essai",
        "redeem_code": "Utiliser le Code",
        "redeeming": "Utilisation...",
        "trial_code_success": "Code d'essai utilisé avec succès!",
        "trial_code_invalid": "Code d'essai invalide",
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
        "blue_description": "Dein Körper bewegt sich langsam. Du fühlst dich vielleicht müde, traurig oder brauchst Ruhe.",
        "green_description": "Du fühlst dich ruhig, glücklich und bereit. Das ist ein tolles Gefühl!",
        "yellow_description": "Du fängst an, dich wackelig zu fühlen. Du kannst albern, besorgt oder frustriert sein.",
        "red_description": "Dein Körper hat gerade große Gefühle. Du kannst dich sehr aufgewühlt fühlen.",
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
        "hi": "Hallo",
        "need_help": "Brauchst du Hilfe? Tippe hier!",
        "support_message": "Du kannst immer einen Erwachsenen um Hilfe bitten",
        "how_i_feel": "Wie ich mich fühle",
        "my_helpers": "Meine Helfer",
        "my_creatures": "Meine Kreaturen",
        "feeling_chart": "Gefühlsdiagramm",
        "all_students": "Alle Schüler",
        "filter_by_classroom": "Nach Klasse filtern",
        "no_profiles_yet": "Noch keine Profile!",
        "create_first_profile": "Erstelle dein erstes Profil",
        "select_profile": "Profil auswählen",
        "tap_to_check_in": "Tippe auf dein Bild zum Einchecken!",
        "add_profile": "Profil hinzufügen",
        "loading_helpers": "Helfer laden...",
        "loading_strategies": "Helfer laden...",
        "green_zone_help": "Super! Hier sind Möglichkeiten, dich gut zu fühlen:",
        "other_zone_help": "Hier sind einige Helfer, die helfen könnten:",
        "tap_helpers_green": "Tippe auf Helfer, die du ausprobieren möchtest:",
        "tap_helpers_other": "Tippe zum Auswählen von Helfern:",
        "tap_strategies_green": "Tippe auf Helfer, die du ausprobieren möchtest:",
        "tap_strategies_help": "Tippe zum Auswählen von Helfern:",
        "great_job_title": "Großartige Arbeit!",
        "keep_it_up": "Weiter so!",
        "streak_bonus": "Serien-Bonus!",
        "day_streak": "Tage hintereinander!",
        "points": "Punkte",
        "continue": "Weiter",
        "loading_creature": "Lade deine Kreatur...",
        "more_points_until": "Punkte mehr bis",
        "evolves": "entwickelt sich!",
        "collected": "Gesammelt",
        "current_friend": "Aktueller Freund",
        "fully_evolved": "Vollständig entwickelt!",
        "keep_growing": "Wachse weiter!",
        "grow_creature_hint": "Nutze Helfer und teile deine Gefühle um deine Kreatur zu entwickeln!",
        "complete": "Fertig!",
        "evolved": "ENTWICKELT!",
        "evolving": "ENTWICKELT SICH...",
        "amazing_continue": "Toll! Weiter",
        "moves": "Bewegungen",
        "outfits": "Outfits",
        "foods": "Essen",
        "homes": "Häuser",
        "bonus_items": "Bonus-Gegenstände",
        "your_creature": "Deine Kreatur",
        "creature_collection": "Meine Kreaturensammlung",
        "stage": "Stufe",
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
        "check_in_feelings": "Meine Gefühle einchecken",
        "view_progress": "Schülerfortschritt anzeigen",
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
        "confirm_logout": "Bist du sicher, dass du dich abmelden möchtest?",
        "free_trial": "Kostenlose Testversion",
        "subscribe": "Abonnieren",
        "sign_in_google": "Mit Google anmelden",
        "have_trial_code": "Hast du einen Testcode?",
        "enter_trial_code": "Testcode eingeben",
        "redeem_code": "Code einlösen",
        "redeeming": "Einlösen...",
        "trial_code_success": "Testcode erfolgreich eingelöst!",
        "trial_code_invalid": "Ungültiger Testcode",
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
        "blue_description": "O teu corpo move-se lentamente. Podes sentir-te cansado, triste, ou precisar de descanso.",
        "green_description": "Sentes-te calmo, feliz e pronto. Este é um grande sentimento!",
        "yellow_description": "Estás a começar a sentir-te instável. Podes sentir-te tolo, preocupado ou frustrado.",
        "red_description": "O teu corpo tem grandes sentimentos agora. Podes sentir-te muito perturbado.",
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
        "hi": "Olá",
        "need_help": "Precisas de ajuda? Toca aqui!",
        "support_message": "Podes sempre pedir ajuda a um adulto",
        "how_i_feel": "Como Me Sinto",
        "my_helpers": "Os Meus Ajudantes",
        "my_creatures": "As Minhas Criaturas",
        "feeling_chart": "Gráfico de Sentimentos",
        "all_students": "Todos os Alunos",
        "filter_by_classroom": "Filtrar por Turma",
        "no_profiles_yet": "Ainda sem perfis!",
        "create_first_profile": "Cria o teu primeiro perfil para começar",
        "select_profile": "Seleciona o teu Perfil",
        "tap_to_check_in": "Toca na tua foto para fazer o check-in!",
        "add_profile": "Adicionar Perfil",
        "loading_helpers": "Carregando ajudantes...",
        "loading_strategies": "Carregando ajudantes...",
        "green_zone_help": "Ótimo! Aqui estão formas de continuar a sentires-te bem:",
        "other_zone_help": "Aqui estão alguns ajudantes que podem ajudar:",
        "tap_helpers_green": "Toca nos ajudantes que gostarias de experimentar:",
        "tap_helpers_other": "Toca para selecionar ajudantes que podem ajudar:",
        "tap_strategies_green": "Toca nos ajudantes que gostarias de experimentar:",
        "tap_strategies_help": "Toca para selecionar ajudantes:",
        "great_job_title": "Trabalho Incrível!",
        "keep_it_up": "Continua assim!",
        "streak_bonus": "bónus de série!",
        "day_streak": "dias seguidos!",
        "points": "Pontos",
        "continue": "Continuar",
        "loading_creature": "Carregando a tua criatura...",
        "more_points_until": "pontos até que",
        "evolves": "evolui!",
        "collected": "Colecionados",
        "current_friend": "Amigo Atual",
        "fully_evolved": "Completamente Evoluído!",
        "keep_growing": "Continua a Crescer!",
        "grow_creature_hint": "Usa ajudantes e partilha os teus sentimentos para evoluir a tua criatura!",
        "complete": "Completo!",
        "evolved": "EVOLUÍDO!",
        "evolving": "A EVOLUIR...",
        "amazing_continue": "Incrível! Continuar",
        "moves": "Movimentos",
        "outfits": "Roupas",
        "foods": "Comida",
        "homes": "Casas",
        "bonus_items": "Itens Bónus",
        "your_creature": "A Tua Criatura",
        "creature_collection": "A Minha Coleção de Criaturas",
        "stage": "Fase",
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
        "check_in_feelings": "Registar os meus sentimentos",
        "view_progress": "Ver progresso dos alunos",
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
        "confirm_logout": "Tens a certeza que queres sair?",
        "free_trial": "Teste Grátis",
        "subscribe": "Subscrever",
        "sign_in_google": "Entrar com Google",
        "have_trial_code": "Tens um código de teste?",
        "enter_trial_code": "Inserir Código de Teste",
        "redeem_code": "Resgatar Código",
        "redeeming": "A resgatar...",
        "trial_code_success": "Código resgatado com sucesso!",
        "trial_code_invalid": "Código inválido",
    },
        "it": {
        "app_name": "Classe della Felicità",
        "how_are_you_feeling": "Come ti senti?",
        "tap_colour_help": "Tocca il colore che corrisponde a come ti senti",
        "choose_helpers": "Scegli i tuoi aiutanti",
        "want_to_say": "Vuoi dire qualcosa?",
        "write_sentence": "Scrivi una frase su come ti senti...",
        "save_checkin": "Salva i miei sentimenti",
        "well_done": "Bravo!",
        "great_job": "Ottimo lavoro nel condividere i tuoi sentimenti!",
        "blue_feelings": "Sentimenti Blu",
        "green_feelings": "Sentimenti Verdi",
        "yellow_feelings": "Sentimenti Gialli",
        "red_feelings": "Sentimenti Rossi",
        "blue_zone": "Sentimenti Blu",
        "green_zone": "Sentimenti Verdi",
        "yellow_zone": "Sentimenti Gialli",
        "red_zone": "Sentimenti Rossi",
        "blue_feeling": "Energia Tranquilla",
        "green_feeling": "Energia Equilibrata",
        "yellow_feeling": "Energia Frizzante",
        "red_feeling": "Grande Energia",
        "blue_description": "Il tuo corpo si muove lentamente. Potresti sentirti stanco, un po triste, o aver bisogno di riposo.",
        "green_description": "Ti senti calmo, felice e pronto. Questo è un grande sentimento!",
        "yellow_description": "Stai iniziando a sentirti instabile. Potresti sentirti sciocco, preoccupato o frustrato.",
        "red_description": "Il tuo corpo ha grandi sentimenti adesso. Potresti sentirti molto turbato.",
        "what_colours_mean": "Cosa significano i colori?",
        "tired": "Stanco",
        "sad": "Triste",
        "lonely": "Solo",
        "need_rest": "Ho bisogno di riposo",
        "calm": "Calmo",
        "happy": "Felice",
        "focused": "Concentrato",
        "ready_to_learn": "Pronto per imparare",
        "silly": "Sciocco",
        "frustrated": "Frustrato",
        "worried": "Preoccupato",
        "butterflies": "Farfalle",
        "super_charged": "Super carico",
        "very_upset": "Molto turbato",
        "out_of_control": "Fuori controllo",
        "explosive": "Esplosivo",
        "hi": "Ciao",
        "need_help": "Hai bisogno di aiuto? Tocca qui!",
        "support_message": "Puoi sempre chiedere aiuto a un adulto",
        "my_creatures": "Le Mie Creature",
        "my_helpers": "I Miei Aiutanti",
        "no_profiles_yet": "Ancora nessun profilo!",
        "create_first_profile": "Crea il tuo primo profilo per iniziare",
        "select_profile": "Seleziona il tuo Profilo",
        "add_profile": "Aggiungi Profilo",
        "loading_helpers": "Caricamento aiutanti...",
        "loading_strategies": "Caricamento aiutanti...",
        "tap_helpers_green": "Tocca gli aiutanti che vorresti provare:",
        "tap_helpers_other": "Tocca per selezionare aiutanti:",
        "tap_strategies_green": "Tocca gli aiutanti che vorresti provare:",
        "tap_strategies_help": "Tocca per selezionare aiutanti:",
        "great_job_title": "Ottimo Lavoro!",
        "keep_it_up": "Continua così!",
        "day_streak": "giorni di fila!",
        "points": "Punti",
        "continue": "Continua",
        "loading_creature": "Caricamento della tua creatura...",
        "evolved": "EVOLUTO!",
        "amazing_continue": "Fantastico! Continua",
        "keep_growing": "Continua a crescere!",
        "creature_collection": "La Mia Collezione di Creature",
        "bonus_items": "Oggetti Bonus",
        "moves": "Mosse",
        "outfits": "Vestiti",
        "foods": "Cibo",
        "homes": "Case",
        "settings": "Impostazioni",
        "language": "Lingua",
        "about": "Info",
        "login": "Accedi",
        "logout": "Esci",
        "confirm": "Conferma",
        "change_language": "Cambia lingua",
        "language_changed": "Lingua cambiata",
        "is_now_default": "è ora la tua lingua predefinita.",
        "i_am_a": "Sono un...",
        "student": "Studente",
        "teacher": "Insegnante",
        "parent": "Genitore",
        "loading": "Caricamento...",
        "save": "Salva",
        "cancel": "Annulla",
        "delete": "Elimina",
        "edit": "Modifica",
        "back": "Indietro",
        "next": "Avanti",
        "done": "Fatto",
        "skip": "Salta",
        "all_students": "Tutti gli Studenti",
        "filter_by_classroom": "Filtra per Classe",
        "days_7": "7 Giorni",
        "days_14": "2 Settimane",
        "days_30": "30 Giorni",
        "free_trial": "Prova Gratuita",
        "subscribe": "Abbonati",
        "sign_in_google": "Accedi con Google",
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
    feeling_colour: str  # blue/green/yellow/red
    helpers_selected: List[str] = []
    comment: Optional[str] = None
    location: str = "school"

class AddPointsRequest(BaseModel):
    points_type: str = "checkin"
    strategy_count: int = 0
    feeling_colour: Optional[str] = "blue"
    zone: Optional[str] = None  # Frontend sends zone, we map to feeling_colour
    
    def get_colour(self):
        return self.zone or self.feeling_colour or "blue"

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

@api_router.get("/creatures/{lang}")
async def get_creatures_translated(lang: str = "en"):
    """Get creatures with translated stage descriptions"""
    lang_t = {**TRANSLATIONS.get("en", {}), **TRANSLATIONS.get(lang, {})}
    creatures = []
    for c in CREATURES:
        c_copy = dict(c)
        c_copy["stages"] = []
        for stage in c.get("stages", []):
            s_copy = dict(stage)
            desc_key = f"creature_{c['id']}_stage_{stage['stage']}_desc"
            name_key = f"creature_{c['id']}_stage_{stage['stage']}_name"
            if desc_key in lang_t:
                s_copy["description"] = lang_t[desc_key]
            if name_key in lang_t:
                s_copy["name"] = lang_t[name_key]
            c_copy["stages"].append(s_copy)
        creatures.append(c_copy)
    return creatures

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
async def get_students(request: Request, device_id: str = None):
    user = await get_current_user(request)
    if user:
        result = supabase.table("students").select("*").eq("user_id", user["user_id"]).execute()
    else:
        result = supabase.table("students").select("*").eq("user_id", f"device_{device_id}").execute() if device_id else supabase.table("students").select("*").execute()
    return result.data or []

@api_router.post("/students")
async def create_student(student: StudentCreate, request: Request, device_id: str = None):
    user = await get_current_user(request)
    if user:
        user_id = user["user_id"]
    else:
        user_id = f"device_{device_id or str(uuid.uuid4())[:8]}"
    new_student = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        
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
        return []
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
async def create_zone_log(request: Request):
    body = await request.json()
    # Accept both 'zone' and 'feeling_colour' for compatibility
    feeling_colour = body.get("feeling_colour") or body.get("zone", "blue")
    new_log = {
        "id": str(uuid.uuid4()),
        "student_id": body.get("student_id"),
        "feeling_colour": feeling_colour,
        "zone": feeling_colour,
        "helpers_selected": body.get("strategies_selected", body.get("helpers_selected", [])),
        "strategies_selected": body.get("strategies_selected", body.get("helpers_selected", [])),
        "comment": body.get("comment"),
        "location": body.get("location", "school"),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    try:
        result = supabase.table("feeling_logs").insert(new_log).execute()
        return result.data[0] if result.data else new_log
    except Exception as e:
        logger.error(f"Error creating zone log: {e}")
        return new_log

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
    # Use translated helpers if available for this language
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
async def get_strategies_compat(zone: str = None, student_id: str = None, lang: str = "en"):
    helpers = []
    colours = [zone] if zone else ["blue","green","yellow","red"]
    for colour in colours:
        for h in DEFAULT_HELPERS.get(colour, []):
            h_copy = dict(h)
            h_copy["zone"] = colour
            h_copy["image_type"] = "icon"
            h_copy["is_custom"] = False
            helpers.append(h_copy)
    return helpers

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
    return {
        "creatures": CREATURES,
        "points_config": POINTS_CONFIG
    }

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
    feeling_colour = req.get_colour()
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

    # Check for bonus items to unlock based on strategies used
    new_unlocks = []
    existing_moves = rewards.get("unlocked_moves", [])
    existing_outfits = rewards.get("unlocked_outfits", [])
    existing_foods = rewards.get("unlocked_foods", [])
    existing_homes = rewards.get("unlocked_homes", [])
    
    # Unlock bonus items when evolving
    if evolved and new_stage > 0:
        creature_full = next((c for c in CREATURES if c["id"] == target_creature), None)
        if creature_full:
            for move in creature_full.get("moves", []):
                if move["unlocks_at_stage"] <= new_stage and move["id"] not in existing_moves:
                    existing_moves.append(move["id"])
                    new_unlocks.append({"type": "move", "item": move})
            for outfit in creature_full.get("outfits", []):
                if outfit["unlocks_at_stage"] <= new_stage and outfit["id"] not in existing_outfits:
                    existing_outfits.append(outfit["id"])
                    new_unlocks.append({"type": "outfit", "item": outfit})
            for food in creature_full.get("foods", []):
                if food["unlocks_at_stage"] <= new_stage and food["id"] not in existing_foods:
                    existing_foods.append(food["id"])
                    new_unlocks.append({"type": "food", "item": food})
            for home in creature_full.get("homes", []):
                if home["unlocks_at_stage"] <= new_stage and home["id"] not in existing_homes:
                    existing_homes.append(home["id"])
                    new_unlocks.append({"type": "home", "item": home})
    
    # Check if creature is fully evolved - add to collected
    collected_creatures = rewards.get("collected_creatures", [])
    if new_stage >= 3 and target_creature not in collected_creatures:
        collected_creatures.append(target_creature)

    update_data = {
        "total_points_earned": total_points,
        "streak_days": streak_days,
        "last_checkin_date": today if req.points_type == "checkin" else last_checkin,
        "creature_points": creature_points,
        "creature_stages": creature_stages,
        "current_creature_id": target_creature,
        "current_stage": new_stage,
        "current_points": new_points,
        "collected_creatures": collected_creatures,
        "unlocked_moves": existing_moves,
        "unlocked_outfits": existing_outfits,
        "unlocked_foods": existing_foods,
        "unlocked_homes": existing_homes,
    }

    if rewards_result.data:
        supabase.table("student_rewards").update(update_data).eq("student_id", student_id).execute()
    else:
        update_data["student_id"] = student_id
        supabase.table("student_rewards").insert(update_data).execute()

    creature_data = next((c for c in CREATURES if c["id"] == target_creature), CREATURES[0])
    # Ensure color field exists
    if "color" not in creature_data:
        color_map = {"aqua_buddy": "#4FC3F7", "leaf_friend": "#81C784", "spark_pal": "#FFD54F", "blaze_heart": "#FF7043"}
        creature_data["color"] = color_map.get(target_creature, "#4FC3F7")

    color_map = {"aqua_buddy": "#4FC3F7", "leaf_friend": "#81C784", "spark_pal": "#FFD54F", "blaze_heart": "#FF7043"}
    creature_data["color"] = color_map.get(target_creature, "#4FC3F7")
    creature_data["zone"] = creature_data.get("feeling_colour", feeling_colour)
    
    return {
        "current_creature": creature_data,
        "current_stage": new_stage,
        "current_points": new_points,
        "evolved": evolved,
        "new_unlocks": new_unlocks if 'new_unlocks' in dir() else [],
        "evolution_info": {"new_stage": new_stage, "new_unlocks": new_unlocks} if evolved and 'new_unlocks' in dir() else None,
        "streak_days": streak_days,
        "total_points_earned": total_points,
        "all_creatures_progress": creature_points,
        "feeling_colour": feeling_colour,
        "zone": feeling_colour,
        "points_added": new_points - (creature_points.get(target_creature, 0) - (new_points - creature_points.get(target_creature, 0))),
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
        return []
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
        return []
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
        return []
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
        return {"is_active": False, "status": "none", "expires_at": None, "trial_started_at": None}
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


# ================== ZONE LOGS COMPAT ENDPOINTS ==================
@api_router.get("/zone-logs/student/{student_id}")
async def get_zone_logs_by_student(student_id: str, days: int = 7):
    return await get_feeling_logs(student_id, days)

@api_router.get("/zone-logs")
async def get_all_zone_logs(student_id: Optional[str] = None, classroom_id: Optional[str] = None, days: int = 7):
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    if student_id:
        result = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start_date).execute()
    elif classroom_id:
        students = supabase.table("students").select("id").eq("classroom_id", classroom_id).execute()
        student_ids = [s["id"] for s in (students.data or [])]
        if not student_ids:
            return []
        result = supabase.table("feeling_logs").select("*").in_("student_id", student_ids).gte("timestamp", start_date).execute()
    else:
        result = supabase.table("feeling_logs").select("*").gte("timestamp", start_date).execute()
    return result.data or []

# ================== TEACHER RESOURCE COMPAT ENDPOINTS ==================
@api_router.get("/teacher-resources")
async def get_teacher_resources(request: Request, topic: Optional[str] = None):
    user = await get_current_user(request)
    if not user:
        return []
    result = supabase.table("resources").select("*").eq("is_active", True).execute()
    return result.data or []

@api_router.get("/teacher-resources/topics")
async def get_teacher_resource_topics():
    return [
        {"id": "general", "name": "General"},
        {"id": "feelings", "name": "Feelings"},
        {"id": "helpers", "name": "Helpers"},
        {"id": "parents", "name": "For Parents"},
    ]

@api_router.post("/teacher-resources")
async def create_teacher_resource(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    new_resource = {
        "id": str(uuid.uuid4()),
        "created_by": user["user_id"],
        "title": body.get("title", ""),
        "description": body.get("description", ""),
        "content_type": body.get("content_type", "text"),
        "content": body.get("content"),
        "pdf_filename": body.get("pdf_filename"),
        "category": body.get("topic", "general"),
        "is_global": False,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = supabase.table("resources").insert(new_resource).execute()
    return result.data[0] if result.data else new_resource

# ================== CUSTOM STRATEGIES COMPAT ==================
@api_router.get("/custom-strategies")
async def get_custom_strategies(request: Request, student_id: Optional[str] = None):
    user = await get_current_user(request)
    if not user:
        return []
    if student_id:
        result = supabase.table("custom_helpers").select("*").eq("student_id", student_id).eq("is_active", True).execute()
    else:
        result = supabase.table("custom_helpers").select("*").eq("user_id", user["user_id"]).eq("is_active", True).execute()
    return result.data or []

@api_router.post("/custom-strategies")
async def create_custom_strategy(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    new_helper = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "student_id": body.get("student_id"),
        "name": body.get("name", ""),
        "description": body.get("description", ""),
        "feeling_colour": body.get("zone", body.get("feeling_colour", "green")),
        "icon": body.get("icon", "star"),
        "custom_image": body.get("custom_image"),
        "is_shared": body.get("is_shared", False),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = supabase.table("custom_helpers").insert(new_helper).execute()
    return result.data[0] if result.data else new_helper

@api_router.delete("/custom-strategies/{helper_id}")
async def delete_custom_strategy(helper_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    supabase.table("custom_helpers").delete().eq("id", helper_id).execute()
    return {"message": "Deleted"}

# ================== ANALYTICS COMPAT ==================
@api_router.get("/analytics/student/{student_id}/month/{year}/{month}")
async def get_student_monthly_analytics(student_id: str, year: int, month: int):
    start = datetime(year, month, 1, tzinfo=timezone.utc).isoformat()
    import calendar as cal
    _, last_day = cal.monthrange(year, month)
    end = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc).isoformat()
    logs = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start).lte("timestamp", end).execute()
    logs_data = logs.data or []
    feeling_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    for log in logs_data:
        colour = log.get("feeling_colour", log.get("zone", ""))
        if colour in feeling_counts:
            feeling_counts[colour] += 1
    return {"feeling_counts": feeling_counts, "zone_counts": feeling_counts, "total_logs": len(logs_data)}

# ================== SHARING/LINKING COMPAT ==================
@api_router.get("/teacher/student/{student_id}/sharing-status")
async def get_sharing_status(student_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        return {"is_linked_to_parent": False, "home_sharing_enabled": False, "school_sharing_enabled": False}
    links = supabase.table("parent_links").select("*").eq("student_id", student_id).execute()
    return {
        "is_linked_to_parent": len(links.data or []) > 0,
        "home_sharing_enabled": False,
        "school_sharing_enabled": False
    }

@api_router.post("/students/link")
async def link_student_from_parent(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    link_code = body.get("link_code", "")
    result = supabase.table("students").select("*").eq("link_code", link_code).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Invalid link code")
    student = result.data[0]
    supabase.table("parent_links").insert({
        "id": str(uuid.uuid4()),
        "parent_user_id": user["user_id"],
        "student_id": student["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    }).execute()
    return {"message": "Child linked", "student_id": student["id"], "student_name": student["name"]}

# ================== SUBSCRIPTION PLANS ==================
@api_router.get("/subscription/plans")
async def get_subscription_plans_list():
    return SUBSCRIPTION_PLANS

# ================== FAMILY STRATEGIES COMPAT ==================
@api_router.get("/family/strategies")
async def get_family_strategies(request: Request):
    user = await get_current_user(request)
    if not user:
        return []
    result = supabase.table("custom_helpers").select("*").eq("user_id", user["user_id"]).execute()
    return result.data or []


# ================== ZONE LOGS COMPAT ENDPOINTS ==================
@api_router.get("/zone-logs/student/{student_id}")
async def get_zone_logs_by_student(student_id: str, days: int = 7):
    return await get_feeling_logs(student_id, days)

@api_router.get("/zone-logs")
async def get_all_zone_logs(student_id: Optional[str] = None, classroom_id: Optional[str] = None, days: int = 7):
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    if student_id:
        result = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start_date).execute()
    elif classroom_id:
        students = supabase.table("students").select("id").eq("classroom_id", classroom_id).execute()
        student_ids = [s["id"] for s in (students.data or [])]
        if not student_ids:
            return []
        result = supabase.table("feeling_logs").select("*").in_("student_id", student_ids).gte("timestamp", start_date).execute()
    else:
        result = supabase.table("feeling_logs").select("*").gte("timestamp", start_date).execute()
    return result.data or []

# ================== TEACHER RESOURCE COMPAT ENDPOINTS ==================
@api_router.get("/teacher-resources")
async def get_teacher_resources(request: Request, topic: Optional[str] = None):
    user = await get_current_user(request)
    if not user:
        return []
    result = supabase.table("resources").select("*").eq("is_active", True).execute()
    return result.data or []

@api_router.get("/teacher-resources/topics")
async def get_teacher_resource_topics():
    return [
        {"id": "general", "name": "General"},
        {"id": "feelings", "name": "Feelings"},
        {"id": "helpers", "name": "Helpers"},
        {"id": "parents", "name": "For Parents"},
    ]

@api_router.post("/teacher-resources")
async def create_teacher_resource(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    new_resource = {
        "id": str(uuid.uuid4()),
        "created_by": user["user_id"],
        "title": body.get("title", ""),
        "description": body.get("description", ""),
        "content_type": body.get("content_type", "text"),
        "content": body.get("content"),
        "pdf_filename": body.get("pdf_filename"),
        "category": body.get("topic", "general"),
        "is_global": False,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = supabase.table("resources").insert(new_resource).execute()
    return result.data[0] if result.data else new_resource

# ================== CUSTOM STRATEGIES COMPAT ==================
@api_router.get("/custom-strategies")
async def get_custom_strategies(request: Request, student_id: Optional[str] = None):
    user = await get_current_user(request)
    if not user:
        return []
    if student_id:
        result = supabase.table("custom_helpers").select("*").eq("student_id", student_id).eq("is_active", True).execute()
    else:
        result = supabase.table("custom_helpers").select("*").eq("user_id", user["user_id"]).eq("is_active", True).execute()
    return result.data or []

@api_router.post("/custom-strategies")
async def create_custom_strategy(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    new_helper = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "student_id": body.get("student_id"),
        "name": body.get("name", ""),
        "description": body.get("description", ""),
        "feeling_colour": body.get("zone", body.get("feeling_colour", "green")),
        "icon": body.get("icon", "star"),
        "custom_image": body.get("custom_image"),
        "is_shared": body.get("is_shared", False),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = supabase.table("custom_helpers").insert(new_helper).execute()
    return result.data[0] if result.data else new_helper

@api_router.delete("/custom-strategies/{helper_id}")
async def delete_custom_strategy(helper_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    supabase.table("custom_helpers").delete().eq("id", helper_id).execute()
    return {"message": "Deleted"}

# ================== ANALYTICS COMPAT ==================
@api_router.get("/analytics/student/{student_id}/month/{year}/{month}")
async def get_student_monthly_analytics(student_id: str, year: int, month: int):
    start = datetime(year, month, 1, tzinfo=timezone.utc).isoformat()
    import calendar as cal
    _, last_day = cal.monthrange(year, month)
    end = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc).isoformat()
    logs = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start).lte("timestamp", end).execute()
    logs_data = logs.data or []
    feeling_counts = {"blue": 0, "green": 0, "yellow": 0, "red": 0}
    for log in logs_data:
        colour = log.get("feeling_colour", log.get("zone", ""))
        if colour in feeling_counts:
            feeling_counts[colour] += 1
    return {"feeling_counts": feeling_counts, "zone_counts": feeling_counts, "total_logs": len(logs_data)}

# ================== SHARING/LINKING COMPAT ==================
@api_router.get("/teacher/student/{student_id}/sharing-status")
async def get_sharing_status(student_id: str, request: Request):
    user = await get_current_user(request)
    if not user:
        return {"is_linked_to_parent": False, "home_sharing_enabled": False, "school_sharing_enabled": False}
    links = supabase.table("parent_links").select("*").eq("student_id", student_id).execute()
    return {
        "is_linked_to_parent": len(links.data or []) > 0,
        "home_sharing_enabled": False,
        "school_sharing_enabled": False
    }

@api_router.post("/students/link")
async def link_student_from_parent(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    link_code = body.get("link_code", "")
    result = supabase.table("students").select("*").eq("link_code", link_code).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Invalid link code")
    student = result.data[0]
    supabase.table("parent_links").insert({
        "id": str(uuid.uuid4()),
        "parent_user_id": user["user_id"],
        "student_id": student["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    }).execute()
    return {"message": "Child linked", "student_id": student["id"], "student_name": student["name"]}

# ================== SUBSCRIPTION PLANS ==================
@api_router.get("/subscription/plans")
async def get_subscription_plans_list():
    return SUBSCRIPTION_PLANS

# ================== FAMILY STRATEGIES COMPAT ==================
@api_router.get("/family/strategies")
async def get_family_strategies(request: Request):
    user = await get_current_user(request)
    if not user:
        return []
    result = supabase.table("custom_helpers").select("*").eq("user_id", user["user_id"]).execute()
    return result.data or []


@api_router.get("/strategies/student/{student_id}")
async def get_strategies_for_student(student_id: str, zone: str = None, lang: str = "en"):
    helpers = []
    colours = [zone] if zone else ["blue","green","yellow","red"]
    for colour in colours:
        for h in DEFAULT_HELPERS.get(colour, []):
            h_copy = dict(h)
            h_copy["zone"] = colour
            h_copy["image_type"] = "icon"
            h_copy["is_custom"] = False
            helpers.append(h_copy)
    return helpers





@api_router.get("/rewards/{student_id}/collection")
async def get_rewards_collection(student_id: str):
    """Get full creature collection with all progress for a student"""
    color_map = {"aqua_buddy": "#4FC3F7", "leaf_friend": "#81C784", "spark_pal": "#FFD54F", "blaze_heart": "#FF7043"}
    
    def enrich_creature(c, points=0, stage=0, is_collected=False):
        c = dict(c)
        c["color"] = color_map.get(c["id"], "#4FC3F7")
        c["zone"] = c.get("feeling_colour", "blue")
        c["current_points"] = points
        c["current_stage"] = stage
        c["is_collected"] = is_collected
        return c
    
    # Default response with aqua buddy
    default_creature = enrich_creature(CREATURES[0])
    default_response = {
        "student_id": student_id,
        "current_creature": default_creature,
        "current_stage": 0,
        "current_points": 0,
        "collected_creatures": [],
        "all_creatures": [enrich_creature(c) for c in CREATURES],
        "all_creatures_progress": {c["id"]: {"points": 0, "stage": 0} for c in CREATURES},
        "total_creatures": len(CREATURES),
        "total_collected": 0,
        "total_points_earned": 0,
        "unlocked_moves": [],
        "unlocked_outfits": [],
        "unlocked_foods": [],
        "unlocked_homes": [],
        "streak_days": 0,
    }
    
    try:
        result = supabase.table("student_rewards").select("*").eq("student_id", student_id).execute()
        if not result.data:
            return default_response
        
        r = result.data[0]
        
        # Parse JSON fields
        import json
        creature_points = r.get("creature_points", {})
        creature_stages = r.get("creature_stages", {})
        if isinstance(creature_points, str):
            creature_points = json.loads(creature_points)
        if isinstance(creature_stages, str):
            creature_stages = json.loads(creature_stages)
        
        collected_ids = r.get("collected_creatures", [])
        current_creature_id = r.get("current_creature_id", "aqua_buddy")
        
        # Build all creatures with progress
        all_creatures = []
        all_progress = {}
        for c in CREATURES:
            cid = c["id"]
            pts = creature_points.get(cid, 0)
            stg = creature_stages.get(cid, 0)
            is_collected = cid in collected_ids
            all_creatures.append(enrich_creature(c, pts, stg, is_collected))
            all_progress[cid] = {"points": pts, "stage": stg, "collected": is_collected}
        
        # Get current creature
        current_c = next((c for c in CREATURES if c["id"] == current_creature_id), CREATURES[0])
        current_pts = creature_points.get(current_creature_id, 0)
        current_stg = creature_stages.get(current_creature_id, 0)
        current_creature = enrich_creature(current_c, current_pts, current_stg)
        
        # Get collected creatures with full data
        collected = []
        for cid in collected_ids:
            c = next((x for x in CREATURES if x["id"] == cid), None)
            if c:
                pts = creature_points.get(cid, 0)
                stg = creature_stages.get(cid, 0)
                collected.append(enrich_creature(c, pts, stg, True))
        
        # Build unlocked items from all collected/evolved creatures
        unlocked_moves = r.get("unlocked_moves", [])
        unlocked_outfits = r.get("unlocked_outfits", [])
        unlocked_foods = r.get("unlocked_foods", [])
        unlocked_homes = r.get("unlocked_homes", [])
        
        return {
            "student_id": student_id,
            "current_creature": current_creature,
            "current_stage": current_stg,
            "current_points": current_pts,
            "collected_creatures": collected,
            "all_creatures": all_creatures,
            "all_creatures_progress": all_progress,
            "total_creatures": len(CREATURES),
            "total_collected": len(collected_ids),
            "total_points_earned": r.get("total_points_earned", 0),
            "unlocked_moves": unlocked_moves,
            "unlocked_outfits": unlocked_outfits,
            "unlocked_foods": unlocked_foods,
            "unlocked_homes": unlocked_homes,
            "streak_days": r.get("streak_days", 0),
        }
    except Exception as e:
        logger.error(f"Collection error: {e}")
        return default_response

app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
