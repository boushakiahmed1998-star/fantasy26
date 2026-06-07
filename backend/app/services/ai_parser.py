"""
Service IA — Extraction de joueurs/entraîneurs depuis texte ou image.
- Texte → Groq (llama-3.3-70b-versatile)
- Image → Groq Vision (llama-3.2-11b-vision-preview)
"""

import base64
import json
import logging
import re

from groq import Groq

from app.config import settings

logger = logging.getLogger(__name__)

# ── Prompts système ───────────────────────────────────────────────────────────

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
    """Nettoie le JSON brut (enlève balises markdown si présentes)."""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


def parse_from_text(text: str) -> dict:
    """
    Envoie le texte à Groq (llama-3.3-70b-versatile) et retourne le JSON structuré.
    """
    client = Groq(api_key=settings.GROQ_API_KEY)

    try:
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
        cleaned = _clean_json_response(raw)
        result = json.loads(cleaned)
        logger.info(f"Groq parsed {len(result.get('data', []))} entries")
        return result

    except json.JSONDecodeError as e:
        logger.error(f"Groq JSON parse error: {e} | raw: {raw[:200]}")
        raise ValueError(f"Groq a retourné un JSON invalide : {e}")
    except Exception as e:
        logger.error(f"Groq API error: {e}")
        raise RuntimeError(f"Erreur Groq : {e}")


def parse_from_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """
    Envoie l'image à Groq Vision (llama-3.2-11b-vision-preview) et retourne le JSON structuré.
    """
    client = Groq(api_key=settings.GROQ_API_KEY)

    try:
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        image_url = f"data:{mime_type};base64,{image_b64}"

        response = client.chat.completions.create(
            model="llama-3.2-11b-vision-preview",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": image_url},
                        },
                        {
                            "type": "text",
                            "text": VISION_PROMPT,
                        },
                    ],
                }
            ],
            temperature=0.1,
            max_tokens=4096,
        )

        raw = response.choices[0].message.content
        cleaned = _clean_json_response(raw)
        result = json.loads(cleaned)
        logger.info(f"Groq Vision parsed {len(result.get('data', []))} entries from image")
        return result

    except json.JSONDecodeError as e:
        logger.error(f"Groq Vision JSON parse error: {e}")
        raise ValueError(f"Groq Vision a retourné un JSON invalide : {e}")
    except Exception as e:
        logger.error(f"Groq Vision API error: {e}")
        raise RuntimeError(f"Erreur Groq Vision : {e}")


def parse_auto(text: str | None = None, image_bytes: bytes | None = None, mime_type: str = "image/jpeg") -> dict:
    """
    Dispatcher : image → Groq Vision, texte → Groq.
    """
    if image_bytes:
        return parse_from_image(image_bytes, mime_type)
    elif text:
        return parse_from_text(text)
    else:
        raise ValueError("Fournissez du texte ou une image.")