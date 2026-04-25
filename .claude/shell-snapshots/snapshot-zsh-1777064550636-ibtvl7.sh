# Snapshot file
# Unset all aliases to avoid conflicts with functions
unalias -a 2>/dev/null || true
# Functions
__arguments () {
	# undefined
	builtin autoload -XUz
}
__bun_dynamic_comp () {
	local comp="" 
	for arg in scripts
	do
		local line
		while read -r line
		do
			local name="$line" 
			local desc="$line" 
			name="${name%$'\t'*}" 
			desc="${desc/*$'\t'/}" 
			echo
		done <<< "$arg"
	done
	return $comp
}
auto () {
	if [[ "$1" == "research" ]]
	then
		local topic="${@:2}" 
		cd /Volumes/T7/_TOOLS/AutoResearchClaw && source venv/bin/activate && research run --topic "$topic" --auto-approve
	else
		echo "Usage: auto research \"your topic here\""
	fi
}
compaudit () {
	# undefined
	builtin autoload -XUz /usr/share/zsh/5.9/functions
}
compdef () {
	local opt autol type func delete eval new i ret=0 cmd svc 
	local -a match mbegin mend
	emulate -L zsh
	setopt extendedglob
	if (( ! $# ))
	then
		print -u2 "$0: I need arguments"
		return 1
	fi
	while getopts "anpPkKde" opt
	do
		case "$opt" in
			(a) autol=yes  ;;
			(n) new=yes  ;;
			([pPkK]) if [[ -n "$type" ]]
				then
					print -u2 "$0: type already set to $type"
					return 1
				fi
				if [[ "$opt" = p ]]
				then
					type=pattern 
				elif [[ "$opt" = P ]]
				then
					type=postpattern 
				elif [[ "$opt" = K ]]
				then
					type=widgetkey 
				else
					type=key 
				fi ;;
			(d) delete=yes  ;;
			(e) eval=yes  ;;
		esac
	done
	shift OPTIND-1
	if (( ! $# ))
	then
		print -u2 "$0: I need arguments"
		return 1
	fi
	if [[ -z "$delete" ]]
	then
		if [[ -z "$eval" ]] && [[ "$1" = *\=* ]]
		then
			while (( $# ))
			do
				if [[ "$1" = *\=* ]]
				then
					cmd="${1%%\=*}" 
					svc="${1#*\=}" 
					func="$_comps[${_services[(r)$svc]:-$svc}]" 
					[[ -n ${_services[$svc]} ]] && svc=${_services[$svc]} 
					[[ -z "$func" ]] && func="${${_patcomps[(K)$svc][1]}:-${_postpatcomps[(K)$svc][1]}}" 
					if [[ -n "$func" ]]
					then
						_comps[$cmd]="$func" 
						_services[$cmd]="$svc" 
					else
						print -u2 "$0: unknown command or service: $svc"
						ret=1 
					fi
				else
					print -u2 "$0: invalid argument: $1"
					ret=1 
				fi
				shift
			done
			return ret
		fi
		func="$1" 
		[[ -n "$autol" ]] && autoload -rUz "$func"
		shift
		case "$type" in
			(widgetkey) while [[ -n $1 ]]
				do
					if [[ $# -lt 3 ]]
					then
						print -u2 "$0: compdef -K requires <widget> <comp-widget> <key>"
						return 1
					fi
					[[ $1 = _* ]] || 1="_$1" 
					[[ $2 = .* ]] || 2=".$2" 
					[[ $2 = .menu-select ]] && zmodload -i zsh/complist
					zle -C "$1" "$2" "$func"
					if [[ -n $new ]]
					then
						bindkey "$3" | IFS=$' \t' read -A opt
						[[ $opt[-1] = undefined-key ]] && bindkey "$3" "$1"
					else
						bindkey "$3" "$1"
					fi
					shift 3
				done ;;
			(key) if [[ $# -lt 2 ]]
				then
					print -u2 "$0: missing keys"
					return 1
				fi
				if [[ $1 = .* ]]
				then
					[[ $1 = .menu-select ]] && zmodload -i zsh/complist
					zle -C "$func" "$1" "$func"
				else
					[[ $1 = menu-select ]] && zmodload -i zsh/complist
					zle -C "$func" ".$1" "$func"
				fi
				shift
				for i
				do
					if [[ -n $new ]]
					then
						bindkey "$i" | IFS=$' \t' read -A opt
						[[ $opt[-1] = undefined-key ]] || continue
					fi
					bindkey "$i" "$func"
				done ;;
			(*) while (( $# ))
				do
					if [[ "$1" = -N ]]
					then
						type=normal 
					elif [[ "$1" = -p ]]
					then
						type=pattern 
					elif [[ "$1" = -P ]]
					then
						type=postpattern 
					else
						case "$type" in
							(pattern) if [[ $1 = (#b)(*)=(*) ]]
								then
									_patcomps[$match[1]]="=$match[2]=$func" 
								else
									_patcomps[$1]="$func" 
								fi ;;
							(postpattern) if [[ $1 = (#b)(*)=(*) ]]
								then
									_postpatcomps[$match[1]]="=$match[2]=$func" 
								else
									_postpatcomps[$1]="$func" 
								fi ;;
							(*) if [[ "$1" = *\=* ]]
								then
									cmd="${1%%\=*}" 
									svc=yes 
								else
									cmd="$1" 
									svc= 
								fi
								if [[ -z "$new" || -z "${_comps[$1]}" ]]
								then
									_comps[$cmd]="$func" 
									[[ -n "$svc" ]] && _services[$cmd]="${1#*\=}" 
								fi ;;
						esac
					fi
					shift
				done ;;
		esac
	else
		case "$type" in
			(pattern) unset "_patcomps[$^@]" ;;
			(postpattern) unset "_postpatcomps[$^@]" ;;
			(key) print -u2 "$0: cannot restore key bindings"
				return 1 ;;
			(*) unset "_comps[$^@]" ;;
		esac
	fi
}
compdump () {
	# undefined
	builtin autoload -XUz /usr/share/zsh/5.9/functions
}
compinit () {
	# undefined
	builtin autoload -XUz /usr/share/zsh/5.9/functions
}
compinstall () {
	# undefined
	builtin autoload -XUz /usr/share/zsh/5.9/functions
}
getent () {
	if [[ $1 = hosts ]]
	then
		sed 's/#.*//' /etc/$1 | grep -w $2
	elif [[ $2 = <-> ]]
	then
		grep ":$2:[^:]*$" /etc/$1
	else
		grep "^$2:" /etc/$1
	fi
}
precmd () {
	PS1_CONTEXT_BAR="$(render_context_bar)" 
}
render_context_bar () {
	local percent=${CONTEXT_LOAD:-15} 
	local total_blocks=20 
	local filled_blocks=$(( percent * total_blocks / 100 )) 
	local empty_blocks=$(( total_blocks - filled_blocks )) 
	local color="%F{112}" 
	if [ "$percent" -ge 85 ]
	then
		color="%F{196}" 
	elif [ "$percent" -ge 60 ]
	then
		color="%F{214}" 
	fi
	local bar_string="" 
	for ((i=0; i<filled_blocks; i++)) do
		bar_string+="■" 
	done
	for ((i=0; i<empty_blocks; i++)) do
		bar_string+="□" 
	done
	echo "${color}CTX [${bar_string}] ${percent}%%%f"
}
# Shell Options
setopt nohashdirs
setopt login
setopt promptsubst
# Aliases
alias -- ai=/Users/marcelspatz/NUDIMMUD/Scripts/ai
alias -- c='/Users/marcelspatz/NUDIMMUD/Scripts/ai claude'
alias -- dot_clean_t7='find /Volumes/T7 -name "._*" -type f -not -path "*/RECOVERY/*" -delete && echo "T7: ._* files cleaned"'
alias -- g='/Users/marcelspatz/NUDIMMUD/Scripts/ai gemini'
alias -- oracle=claude
alias -- run-help=man
alias -- tri='/Users/marcelspatz/NUDIMMUD/Scripts/ai triage'
alias -- which-command=whence
alias -- x='/Users/marcelspatz/NUDIMMUD/Scripts/ai codex'
# Check for rg availability
if ! (unalias rg 2>/dev/null; command -v rg) >/dev/null 2>&1; then
  function rg {
  local _cc_bin="${CLAUDE_CODE_EXECPATH:-}"
  [[ -x $_cc_bin ]] || _cc_bin=$(command -v claude 2>/dev/null)
  if [[ ! -x $_cc_bin ]]; then command rg "$@"; return; fi
  if [[ -n $ZSH_VERSION ]]; then
    ARGV0=rg "$_cc_bin" "$@"
  elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
    ARGV0=rg "$_cc_bin" "$@"
  elif [[ $BASHPID != $$ ]]; then
    exec -a rg "$_cc_bin" "$@"
  else
    (exec -a rg "$_cc_bin" "$@")
  fi
}
fi
export PATH='/Users/marcelspatz/.bun/bin:/Users/marcelspatz/.local/bin:/Users/marcelspatz/.antigravity/antigravity/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/opt/pkg/env/active/bin:/opt/pmk/env/global/bin:/Library/Apple/usr/bin:/opt/ImageMagick/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/2bec74ac-f333-470c-bb5a-a037ae63faa1/98dba074-49cb-43f6-bca9-b70d6e084cf5/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_018pLNd4CGF8vEEmyztWR7fi/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_01MKcJsEAmPJswuCytbMJYZJ/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_011VCCbVFqAn2m9NLT6tYcch/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_01YS7PZc73j8hf4aEJiRr2KQ/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_01XH8yMVJbQydrVkX6WgLvck/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_01GC5sHmfRpUwySPemYHW7n5/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_015mMo6NfTokoNVaKCDw72FM/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_01NwRqPNp2fymu8ctzJhD4fx/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_01S5vijNgfCWGfVaeNbYCdNz/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_01MDPHx1gWYn4qF2NfPQJSM1/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_01XLdTqJWhdxY7QuErqYHnFL/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_01FH9TqiaHWhhAGSQo7UCTZt/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_01C5Vqmi896cvokigm3MZSVU/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_0113jG9ujs2aj4giJ7X4SQ3d/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_01M1e3zn4FaacRqzf1kNsSAN/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_01LE8tT9qAeeXKkpJ3yvTHUM/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_01578WzEQ99fNAkr5AEQ2qY4/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_01WuYNh13qTrxjeXFf8m4Ddb/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_017g1fvepTa1LPLHZw93nEpJ/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_01KjzMcMh2RYCovBRPy8VJC8/bin:/Users/marcelspatz/Library/Application Support/Claude/local-agent-mode-sessions/98dba074-49cb-43f6-bca9-b70d6e084cf5/2bec74ac-f333-470c-bb5a-a037ae63faa1/rpm/plugin_013JjEkDBReDqbMSxTRbeRJs/bin'
