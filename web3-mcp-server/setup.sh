#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=============================================="
echo "  Due AI Web3 MCP Server + OpenClaw Setup"
echo "=============================================="
echo ""

# --- Check Docker ---
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running. Please start Docker Desktop first."
    exit 1
fi
echo "[ok] Docker is running"

# --- Create .env if missing ---
if [ ! -f .env ]; then
    echo "[..] Creating .env from template..."
    cp .env.example .env
    echo "     Please edit .env and add your keys, then re-run this script."
    exit 0
fi

# --- Load .env ---
set -a
source .env
set +a

# --- Defaults ---
OPENCLAW_MODEL="${OPENCLAW_MODEL:-anthropic/claude-sonnet-4-5-20250929}"
OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
TELEGRAM_DM_POLICY="${TELEGRAM_DM_POLICY:-open}"
DISCORD_DM_POLICY="${DISCORD_DM_POLICY:-open}"
WHATSAPP_DM_POLICY="${WHATSAPP_DM_POLICY:-open}"

# --- Detect provider from model and validate API key ---
MODEL_PROVIDER=$(echo "$OPENCLAW_MODEL" | cut -d'/' -f1)

case "$MODEL_PROVIDER" in
    anthropic)
        if [ -z "$ANTHROPIC_API_KEY" ]; then
            echo "ERROR: OPENCLAW_MODEL=$OPENCLAW_MODEL requires ANTHROPIC_API_KEY in .env"
            exit 1
        fi
        echo "[ok] Provider: Anthropic ($OPENCLAW_MODEL)"
        ;;
    openai)
        if [ -z "$OPENAI_API_KEY" ]; then
            echo "ERROR: OPENCLAW_MODEL=$OPENCLAW_MODEL requires OPENAI_API_KEY in .env"
            exit 1
        fi
        echo "[ok] Provider: OpenAI ($OPENCLAW_MODEL)"
        ;;
    google)
        if [ -z "$GEMINI_API_KEY" ]; then
            echo "ERROR: OPENCLAW_MODEL=$OPENCLAW_MODEL requires GEMINI_API_KEY in .env"
            exit 1
        fi
        echo "[ok] Provider: Google ($OPENCLAW_MODEL)"
        ;;
    ollama)
        OLLAMA_HOST="${OLLAMA_HOST:-http://host.docker.internal:11434}"
        OLLAMA_ENABLED="true"
        echo "[ok] Provider: Ollama local ($OPENCLAW_MODEL)"
        echo "     Ollama API: $OLLAMA_HOST"
        ;;
    *)
        echo "[!!] Unknown provider '$MODEL_PROVIDER' — make sure the right API key is set"
        ;;
esac

# --- Generate gateway token if empty ---
if [ -z "$OPENCLAW_GATEWAY_TOKEN" ]; then
    OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32)
    if grep -q "^OPENCLAW_GATEWAY_TOKEN=" .env; then
        sed -i.bak "s/^OPENCLAW_GATEWAY_TOKEN=.*/OPENCLAW_GATEWAY_TOKEN=$OPENCLAW_GATEWAY_TOKEN/" .env && rm -f .env.bak
    else
        echo "OPENCLAW_GATEWAY_TOKEN=$OPENCLAW_GATEWAY_TOKEN" >> .env
    fi
    echo "[ok] Generated gateway token"
fi

# --- Build channels JSON + plugins JSON ---
CHANNELS=""
PLUGINS=""

# Telegram
if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    TG_ALLOW='["*"]'
    [ "$TELEGRAM_DM_POLICY" != "open" ] && TG_ALLOW='[]'
    CHANNELS="${CHANNELS:+$CHANNELS,
    }\"telegram\": {
      \"dmPolicy\": \"$TELEGRAM_DM_POLICY\",
      \"botToken\": \"$TELEGRAM_BOT_TOKEN\",
      \"allowFrom\": $TG_ALLOW,
      \"groupPolicy\": \"allowlist\",
      \"streamMode\": \"partial\"
    }"
    PLUGINS="${PLUGINS:+$PLUGINS,
      }\"telegram\": { \"enabled\": true }"
    echo "[ok] Telegram channel configured (dmPolicy: $TELEGRAM_DM_POLICY)"
else
    echo "[--] Telegram: skipped (no TELEGRAM_BOT_TOKEN)"
fi

# Discord
if [ -n "$DISCORD_BOT_TOKEN" ]; then
    DC_ALLOW='["*"]'
    [ "$DISCORD_DM_POLICY" != "open" ] && DC_ALLOW='[]'
    CHANNELS="${CHANNELS:+$CHANNELS,
    }\"discord\": {
      \"token\": \"$DISCORD_BOT_TOKEN\",
      \"dm\": {
        \"enabled\": true,
        \"policy\": \"$DISCORD_DM_POLICY\",
        \"allowFrom\": $DC_ALLOW
      }
    }"
    PLUGINS="${PLUGINS:+$PLUGINS,
      }\"discord\": { \"enabled\": true }"
    echo "[ok] Discord channel configured (dmPolicy: $DISCORD_DM_POLICY)"
else
    echo "[--] Discord: skipped (no DISCORD_BOT_TOKEN)"
fi

# WhatsApp
if [ -n "$WHATSAPP_ALLOW_FROM" ]; then
    if [ "$WHATSAPP_DM_POLICY" = "open" ]; then
        WA_ALLOW='["*"]'
    else
        WA_ALLOW=$(echo "$WHATSAPP_ALLOW_FROM" | sed 's/,/","/g' | sed 's/^/["/' | sed 's/$/"]/')
    fi
    CHANNELS="${CHANNELS:+$CHANNELS,
    }\"whatsapp\": {
      \"dmPolicy\": \"$WHATSAPP_DM_POLICY\",
      \"allowFrom\": $WA_ALLOW
    }"
    echo "[ok] WhatsApp channel configured (allowFrom: $WHATSAPP_ALLOW_FROM)"
else
    echo "[--] WhatsApp: skipped (no WHATSAPP_ALLOW_FROM)"
    echo "     To pair later: docker compose run --rm openclaw-cli channels login"
fi

# --- Build optional models block (only for custom providers like Ollama) ---
MODELS_BLOCK=""
if [ "$OLLAMA_ENABLED" = "true" ]; then
    OLLAMA_MODEL_NAME=$(echo "$OPENCLAW_MODEL" | cut -d'/' -f2-)
    MODELS_BLOCK="\"models\": {
    \"providers\": {
      \"ollama\": {
        \"api\": \"openai-completions\",
        \"baseUrl\": \"${OLLAMA_HOST}/v1\",
        \"apiKey\": \"ollama\",
        \"models\": [{\"id\": \"$OLLAMA_MODEL_NAME\", \"name\": \"$OLLAMA_MODEL_NAME\"}]
      }
    }
  },"
fi

# --- Generate openclaw.json ---
echo "[..] Generating openclaw.json config..."

CONFIG_DIR="$SCRIPT_DIR/.openclaw"
mkdir -p "$CONFIG_DIR"

cat > "$CONFIG_DIR/openclaw.json" <<JSONEOF
{
  "logging": {
    "level": "debug",
    "consoleLevel": "debug",
    "consoleStyle": "pretty",
    "redactSensitive": "tools"
  },
  $MODELS_BLOCK
  "agents": {
    "defaults": {
      "model": {
        "primary": "$OPENCLAW_MODEL"
      },
      "workspace": "/home/node/.openclaw/workspace",
      "timeoutSeconds": 120,
      "maxConcurrent": 1,
      "subagents": {
        "maxConcurrent": 8
      }
    },
    "list": [
      {
        "id": "due-ai",
        "identity": {
          "name": "Due AI",
          "theme": "Cross-chain crypto assistant powered by Sui, LI.FI, and 61+ blockchain networks"
        }
      }
    ]
  },
  "tools": {
    "profile": "messaging"
  },
  "commands": {
    "native": "auto",
    "nativeSkills": "auto"
  },
  "session": {
    "scope": "per-sender",
    "resetTriggers": ["/new", "/reset"],
    "reset": {
      "mode": "idle",
      "idleMinutes": 30
    }
  },
  "channels": {
    $CHANNELS
  },
  "gateway": {
    "port": $OPENCLAW_GATEWAY_PORT,
    "mode": "local",
    "auth": {
      "token": "$OPENCLAW_GATEWAY_TOKEN"
    }
  },
  "messages": {
    "ackReactionScope": "group-mentions"
  },
  "plugins": {
    "entries": {
      $PLUGINS
    }
  }
}
JSONEOF

# Ensure the openclaw dir is writable by the container (node user, uid 1000)
mkdir -p "$CONFIG_DIR/workspace/memory" "$CONFIG_DIR/canvas" "$CONFIG_DIR/cron"

# --- Copy MCP config to mcporter's expected home path ---
# mcporter discovers configs at ~/.mcporter/mcporter.json (i.e. /home/node/.mcporter/ in container)
# We create a separate .mcporter dir that gets mounted directly to /home/node/.mcporter
MCPORTER_DIR="$SCRIPT_DIR/.mcporter"
mkdir -p "$MCPORTER_DIR"
cp "$SCRIPT_DIR/mcp-config.json" "$MCPORTER_DIR/mcporter.json"
echo "[ok] mcporter config written to .mcporter/mcporter.json"
echo "[ok] OpenClaw config written to .openclaw/openclaw.json"

# --- Seed workspace from templates (won't overwrite existing files) ---
echo "[..] Seeding agent workspace files..."
TEMPLATE_DIR="$SCRIPT_DIR/workspace-template"
WORKSPACE_DIR="$CONFIG_DIR/workspace"

if [ -d "$TEMPLATE_DIR" ]; then
    for f in "$TEMPLATE_DIR"/*.md; do
        filename="$(basename "$f")"
        if [ ! -f "$WORKSPACE_DIR/$filename" ]; then
            cp "$f" "$WORKSPACE_DIR/$filename"
            echo "     + $filename"
        else
            echo "     ~ $filename (already exists, skipped)"
        fi
    done
    echo "[ok] Workspace seeded"
else
    echo "[!!] workspace-template/ not found, skipping workspace seed"
fi

chmod -R 777 "$CONFIG_DIR"
chmod -R 777 "$MCPORTER_DIR"

# --- Build MCP server ---
echo "[..] Building Due AI Web3 MCP Server..."
docker compose build due-ai-web3-mcp

echo ""
echo "=============================================="
echo "  Setup Complete!"
echo "=============================================="
echo ""
echo "Config:    .openclaw/openclaw.json"
echo "Model:     $OPENCLAW_MODEL"
echo "Gateway:   http://localhost:$OPENCLAW_GATEWAY_PORT"
echo "Token:     ${OPENCLAW_GATEWAY_TOKEN:0:8}..."
echo ""
echo "Channels:"
[ -n "$TELEGRAM_BOT_TOKEN" ] && echo "  - Telegram: enabled"
[ -n "$DISCORD_BOT_TOKEN" ]  && echo "  - Discord:  enabled"
[ -n "$WHATSAPP_ALLOW_FROM" ] && echo "  - WhatsApp: enabled"
echo ""
echo "Next steps:"
echo "  docker compose up -d        # Start all services"
echo ""
if [ -z "$TELEGRAM_BOT_TOKEN" ] && [ -z "$DISCORD_BOT_TOKEN" ] && [ -z "$WHATSAPP_ALLOW_FROM" ]; then
    echo "  No channels configured yet. Add tokens to .env and re-run ./setup.sh"
    echo ""
fi
echo "=============================================="
