#!/usr/bin/env bash
# dex.sh — drive René's wired Samsung DeX (S24 → XREAL One Pro) over wireless adb.
#
#   dex.sh connect              pair-free reconnect (mDNS on LAN, else Tailscale IP + port arg)
#   dex.sh open <app>           launch an app as a window on the DeX display (alias or package)
#   dex.sh apps [filter]        list third-party packages
#   dex.sh where                show DeX display id + resolution + focused window
#   dex.sh tile <app> <l|r|full|left3|mid3|right3>   move/resize the app's DeX window
#
# The DeX display id changes on every reconnect — it is detected each call
# by the FLAG_EXTERNAL_DEX_HOSTING flag, never hardcoded.
set -eu  # no pipefail: grep -m1 closes pipes early (SIGPIPE 141)

ADB="${ADB:-$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe}"
TS_IP="100.100.124.121"   # s24-von-rene on Tailscale

alias_pkg() {
  case "${1,,}" in
    whatsapp|wa)               echo com.whatsapp ;;
    mail|email|e-mail)         echo com.samsung.android.email.provider ;;
    edison)                    echo com.easilydo.mail ;;
    chrome)                    echo com.android.chrome ;;
    browser|internet)          echo com.sec.android.app.sbrowser ;;
    sms|messages|nachrichten)  echo com.samsung.android.messaging ;;
    threema)                   echo ch.threema.app ;;
    telegram)                  echo org.telegram.messenger ;;
    teams)                     echo com.microsoft.teams ;;
    calendar|kalender)         echo com.samsung.android.calendar ;;
    files|myfiles|dateien)     echo com.sec.android.app.myfiles ;;
    camera|kamera)             echo com.sec.android.app.camera ;;
    moonlight)                 echo com.limelight ;;
    woo|woocommerce)           echo com.woocommerce.android ;;
    etsy)                      echo com.etsy.butter.sell_on_etsy ;;
    claude)                    echo com.anthropic.claude ;;
    spotify)                   echo com.spotify.music ;;
    notes)                     echo com.samsung.android.app.notes ;;
    post|swisspost)            echo com.nth.swisspost ;;
    drive|docs)                echo com.google.android.apps.docs ;;
    sheets)                    echo com.google.android.apps.docs.editors.sheets ;;
    calculator|rechner)        echo com.sec.android.app.popupcalculator ;;
    *) echo "$1" ;;
  esac
}

serial() { "$ADB" devices | awk 'NR>1 && $2=="device"{print $1; exit}'; }

need() {
  S="$(serial)"
  [[ -n "$S" ]] || { echo "NO_DEVICE — run: dex.sh connect [port]" >&2; exit 2; }
}

sh_() { "$ADB" -s "$S" shell "$@" | tr -d '\r'; }

dex_display() {
  sh_ dumpsys display | grep -m1 -oE 'displayId [0-9]+[^}]*FLAG_EXTERNAL_DEX_HOSTING' | grep -oE '^displayId [0-9]+' | awk '{print $2}'
}

resolve_pkg() {
  local want; want="$(alias_pkg "$1")"
  if sh_ pm path "$want" >/dev/null 2>&1 && [[ -n "$(sh_ pm path "$want")" ]]; then echo "$want"; return; fi
  # fuzzy: first installed package containing the word
  sh_ pm list packages | sed 's/package://' | grep -i -m1 -- "$1" || true
}

task_id() { sh_ dumpsys activity activities | grep -m1 -E "\* Task\{[^ ]+ #[0-9]+ .*A=[0-9]+:$1 " | grep -oE '#[0-9]+' | tr -d '#'; }

case "${1:-}" in
  connect)
    "$ADB" mdns check >/dev/null 2>&1 || true
    if [[ -n "$(serial)" ]]; then echo "CONNECTED $(serial)"; exit 0; fi
    ep="$("$ADB" mdns services | awk '/_adb-tls-connect/{print $3; exit}')"
    if [[ -n "$ep" ]]; then "$ADB" connect "$ep"
    elif [[ -n "${2:-}" ]]; then "$ADB" connect "$TS_IP:$2"
    else echo "NO_MDNS — off-LAN: pass the connect port from Wireless debugging: dex.sh connect <port>" >&2; exit 2; fi
    ;;
  where)
    need; d="$(dex_display)"
    echo "serial=$S dex_display=${d:-NONE}"
    [[ -n "$d" ]] && sh_ dumpsys window displays | grep -A1 "mDisplayId=$d" | grep -oE 'cur=[0-9x]+' || true
    sh_ dumpsys window | grep -m1 mCurrentFocus | sed 's/^ *//'
    ;;
  apps)
    need; sh_ pm list packages -3 | sed 's/package://' | sort | grep -i -- "${2:-.}"
    ;;
  open)
    need; [[ -n "${2:-}" ]] || { echo "usage: dex.sh open <app>" >&2; exit 1; }
    d="$(dex_display)"; [[ -n "$d" ]] || { echo "NO_DEX_DISPLAY — glasses not in DeX?" >&2; exit 3; }
    pkg="$(resolve_pkg "$2")"; [[ -n "$pkg" ]] || { echo "NOT_INSTALLED $2" >&2; exit 4; }
    comp="$(sh_ cmd package resolve-activity --brief -c android.intent.category.LAUNCHER "$pkg" | tail -1)"
    [[ "$comp" == */* ]] || { echo "NO_LAUNCHER $pkg" >&2; exit 4; }
    sh_ am start --display "$d" -n "$comp" >/dev/null
    sleep 1.5
    echo "OPENED $pkg on display $d"; sh_ dumpsys window | grep -m1 mCurrentFocus | sed 's/^ *//'
    ;;
  tile)
    need; pkg="$(resolve_pkg "${2:-}")"; t="$(task_id "$pkg")"
    [[ -n "$t" ]] || { echo "NOT_RUNNING $2 — open it first" >&2; exit 4; }
    d="$(dex_display)"
    read -r W H < <(sh_ dumpsys window displays | grep -A1 "mDisplayId=$d" | grep -oE 'cur=[0-9]+x[0-9]+' | tr -d 'cur=' | tr x ' ')
    case "${3:-}" in
      l)      r="0 0 $((W/2)) $H" ;;
      r)      r="$((W/2)) 0 $W $H" ;;
      full)   r="0 0 $W $H" ;;
      left3)  r="0 0 $((W/3)) $H" ;;
      mid3)   r="$((W/3)) 0 $((2*W/3)) $H" ;;
      right3) r="$((2*W/3)) 0 $W $H" ;;
      *) echo "usage: dex.sh tile <app> l|r|full|left3|mid3|right3" >&2; exit 1 ;;
    esac
    sh_ am task resize "$t" $r && echo "TILED $pkg task=$t -> $r (display ${W}x${H})"
    ;;
  *) sed -n '2,12p' "$0" ;;
esac
