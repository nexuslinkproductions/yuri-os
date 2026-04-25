# ═══════════════════════════════════════════════════════════
#  NUDIMMUD Boot Sequence v2
#  Source from ~/.zshrc:  source ~/NUDIMMUD/_SYSTEM/nudimmud-boot.zsh
# ═══════════════════════════════════════════════════════════

clear

# ── Palette (truecolor) ─────────────────────────────────────
_G="\033[38;2;180;234;144m"    # --cyan-glow  #B4EA90 — NUDIMMUD wordmark
_G2="\033[38;2;56;87;36m"      # --cyan-dim   #385724 — divider
_AU="\033[38;2;92;184;0m"      # --gold-solar #5CB800 — NLP insignia
_GR="\033[38;2;168;168;168m"   # --text-dim   #A8A8A8 — labels
_CY="\033[38;2;180;234;144m"   # --cyan-glow  #B4EA90 — values / index
_BD="\033[1m"
_DM="\033[2m"
_RS="\033[0m"

# ── NLP Insignia ── Nexus Link Productions orbital sigil ────
echo -e "${_AU}"
cat << 'EOF'
              ◆
           ╱  │  ╲
          ◆───◎───◆
           ╲  │  ╱
              ◆
EOF
echo -e "${_RS}"

# ── NUDIMMUD Wordmark ────────────────────────────────────────
echo -e "${_G}${_BD}"
cat << 'EOF'
 █▄  █ █  █ █▀▄  ▀ █▀▄▀█ █▀▄▀█ █  █ █▀▄
 █ ▀▄█ █  █ █  █ █ █   █ █   █ █  █ █  █
 █   ▀ ▀▀▀  ▀▀   ▀ ▀   ▀ ▀   ▀ ▀▀▀  ▀▀
EOF
echo -e "${_RS}"

# ── Operator Block ───────────────────────────────────────────
echo ""
printf "  ${_GR}%-14s${_RS}%s\n"          "OPERATOR"   "NUDIMMUD / NISABA"
printf "  ${_GR}%-14s${_RS}%s\n"          "SESSION"    "$(date '+%Y-%m-%d  %H:%M')"
printf "  ${_GR}%-14s${_CY}%s${_RS}\n"    "MODEL"      "claude-sonnet-4-6"
printf "  ${_GR}%-14s${_RS}%s\n"          "WS"         "ws://localhost:3004/ws/shell"
printf "  ${_GR}%-14s${_CY}%s${_RS}\n"    "INDEX"      "107 359 sym  ·  143 289 rel"
echo ""
echo -e "  ${_G2}──────────────────────────────────────────${_RS}"
echo -e "  ${_GR}type ${_G}help${_RS}${_GR} for cheatsheet  ·  ${_G}c${_RS}${_GR} / ${_G}oracle${_RS}${_GR} to launch Claude${_RS}"
echo ""

# ── PATH: wrapper intercepts all claude launches ─────────────
[[ ":$PATH:" != *":$HOME/NUDIMMUD/bin:"* ]] && export PATH="$HOME/NUDIMMUD/bin:$PATH"

# ── Aliases ──────────────────────────────────────────────────
alias oracle="claude"

# ── Context Bar Engine ───────────────────────────────────────
setopt PROMPT_SUBST

render_context_bar() {
    local percent=${CONTEXT_LOAD:-15}
    local total_blocks=20
    local filled_blocks=$(( percent * total_blocks / 100 ))
    local empty_blocks=$(( total_blocks - filled_blocks ))
    local color="%F{112}"
    if [ "$percent" -ge 85 ]; then
        color="%F{196}"
    elif [ "$percent" -ge 60 ]; then
        color="%F{214}"
    fi
    local bar_string=""
    for ((i=0; i<filled_blocks; i++)); do bar_string+="■"; done
    for ((i=0; i<empty_blocks; i++)); do bar_string+="□"; done
    echo "${color}CTX [${bar_string}] ${percent}%%%f"
}

precmd() {
    PS1_CONTEXT_BAR="$(render_context_bar)"
}

# ── Prompt ───────────────────────────────────────────────────
export PS1=$'\n${PS1_CONTEXT_BAR}\n%F{244}›%f '
