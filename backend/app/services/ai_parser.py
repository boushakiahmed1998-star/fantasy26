"""
Service IA — Extraction de joueurs/entraîneurs depuis texte ou image.
- Texte → Groq (llama-3.3-70b-versatile), fallback Gemini si quota épuisé
- Image → Gemini Vision
"""

import base64
import json
import logging
import re

from groq import Groq
import google.generativeai as genai

from app.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Tu es un extracteur de données sportives expert pour la Coupe du Monde 2026.
À partir du texte fourni, extrais TOUS les joueurs et entraîneurs mentionnés et retourne
UNIQUEMENT un objet JSON valide (sans balises markdown ni texte avant/après) avec cette structure :

{
  "type": "players" | "coaches" | "mixed",
  "data": [
    {
      "name": "Prénom Nom",
      "nationality": "Pays (en français, ex: France, Espagne, Brésil)",
      "position": "GK" | "DEF" | "MID" | "FWD" | "COACH",
      "team": "Nom équipe nationale (en français)",
      "price": <entier en millions, ex: 8>,
      "age": <entier ou null>,
      "jersey_number": <entier ou null>
    }
  ],
  "source_info": "résumé bref de la source"
}

Règles de mapping des postes :
- Gardien, Goalkeeper, GK, Portero → "GK"
- Défenseur, Defender, DEF, Central, Latéral → "DEF"
- Milieu, Midfielder, MID, Médian → "MID"
- Attaquant, Forward, FWD, Ailier, Avant-centre → "FWD"
- Entraîneur, Coach, Sélectionneur, Manager → "COACH"

Si le prix n'est pas mentionné, estime-le selon le calibre du joueur (entre 4 et 15M).
Retourne SEULEMENT le JSON, rien d'autre."""

VISION_PROMPT = """Analyse cette image sportive et extrais tous les joueurs et entraîneurs visibles.
Retourne UNIQUEMENT un JSON valide (sans markdown) avec cette structure exacte :

{
  "type": "players" | "coaches" | "mixed",
  "data": [
    {
      "name": "Prénom Nom",
      "nationality": "Pays",
      "position": "GK" | "DEF" | "MID" | "FWD" | "COACH",
      "team": "Équipe nationale",
      "price": <entier en millions>,
      "age": <entier ou null>,
      "jersey_number": <entier ou null>
    }
  ],
  "source_info": "description brève de l'image"
}

Postes : Gardien→GK, Défenseur→DEF, Milieu→MID, Attaquant→FWD, Entraîneur→COACH.
Prix estimé entre 4-15M si non précisé. Retourne SEULEMENT le JSON."""


def _clean_json_response(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


def _is_quota_error(e: Exception) -> bool:
    """Détecte les erreurs de quota/rate-limit Groq."""
    msg = str(e).lower()
    return any(kw in msg for kw in ["rate_limit", "quota", "429", "too many", "exceeded"])


# ── Groq ──────────────────────────────────────────────────────────────────────

def _parse_groq(text: str) -> dict:
    client = Groq(api_key=settings.GROQ_API_KEY)
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Voici les données à extraire :\n\n{text}"},
        ],
        temperature=0.1,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )
    raw = response.choices[0].message.content
    result = json.loads(_clean_json_response(raw))
    result["_source"] = "groq"
    logger.info(f"Groq parsed {len(result.get('data', []))} entries")
    return result


# ── Gemini texte ──────────────────────────────────────────────────────────────

def _parse_gemini_text(text: str) -> dict:
    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-1.5-flash")
    prompt = f"{SYSTEM_PROMPT}\n\nVoici les données à extraire :\n\n{text}"
    response = model.generate_content(prompt)
    raw = response.text
    result = json.loads(_clean_json_response(raw))
    result["_source"] = "gemini"
    logger.info(f"Gemini parsed {len(result.get('data', []))} entries from text")
    return result


# ── Gemini image ──────────────────────────────────────────────────────────────

def _parse_gemini_image(image_bytes: bytes, mime_type: str) -> dict:
    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-1.5-flash")
    image_part = {"mime_type": mime_type, "data": image_bytes}
    response = model.generate_content([VISION_PROMPT, image_part])
    raw = response.text
    result = json.loads(_clean_json_response(raw))
    result["_source"] = "gemini"
    logger.info(f"Gemini Vision parsed {len(result.get('data', []))} entries from image")
    return result


# ── Groq Vision (fallback image si Gemini indispo) ────────────────────────────

def _parse_groq_image(image_bytes: bytes, mime_type: str) -> dict:
    client = Groq(api_key=settings.GROQ_API_KEY)
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    image_url = f"data:{mime_type};base64,{image_b64}"
    response = client.chat.completions.create(
        model="llama-3.2-11b-vision-preview",
        messages=[{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": image_url}},
                {"type": "text", "text": VISION_PROMPT},
            ],
        }],
        temperature=0.1,
        max_tokens=4096,
    )
    raw = response.choices[0].message.content
    result = json.loads(_clean_json_response(raw))
    result["_source"] = "groq_vision"
    logger.info(f"Groq Vision parsed {len(result.get('data', []))} entries from image")
    return result


# ── Dispatcher public ─────────────────────────────────────────────────────────

def parse_from_text(text: str) -> dict:
    """Groq en premier, bascule sur Gemini si quota épuisé."""
    try:
        return _parse_groq(text)
    except Exception as e:
        if _is_quota_error(e):
            logger.warning(f"Groq quota épuisé → bascule Gemini. Erreur: {e}")
            try:
                return _parse_gemini_text(text)
            except Exception as e2:
                raise RuntimeError(f"Groq ET Gemini ont échoué : Groq={e} | Gemini={e2}")
        logger.error(f"Groq API error: {e}")
        raise RuntimeError(f"Erreur Groq : {e}")


def parse_from_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """Gemini Vision en premier pour les images, Groq Vision en fallback."""
    try:
        return _parse_gemini_image(image_bytes, mime_type)
    except Exception as e:
        logger.warning(f"Gemini Vision failed → bascule Groq Vision. Erreur: {e}")
        try:
            return _parse_groq_image(image_bytes, mime_type)
        except Exception as e2:
            raise RuntimeError(f"Gemini ET Groq Vision ont échoué : Gemini={e} | Groq={e2}")


def parse_auto(text: str | None = None, image_bytes: bytes | None = None, mime_type: str = "image/jpeg") -> dict:
    """Dispatcher : image → Gemini Vision (+ fallback Groq), texte → Groq (+ fallback Gemini)."""
    if image_bytes:
        return parse_from_image(image_bytes, mime_type)
    elif text:
        return parse_from_text(text)
    else:
        raise ValueError("Fournissez du texte ou une image.")