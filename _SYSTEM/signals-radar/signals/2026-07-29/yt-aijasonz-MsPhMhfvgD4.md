---
type: signal-item
channel: youtube
source: youtube/@AIJasonZ
title: Why I switched to Pi...
url: https://www.youtube.com/watch?v=MsPhMhfvgD4
item_id: MsPhMhfvgD4
date: 2026-07-29
signal: "new upload"
tags: [signals]
---

# Why I switched to Pi...

Thanks HubSpot for sponsoring this
video.
If you're into AI agents, you've
probably heard about this Pi agent quite
a lot recently. And most of you probably
know Pi agent because it was what
powering Open Claw. And today I want to
give you a breakdown of what's special
about Pi agent, why it is one of the
best option for you to build agent
system, and in the end how can you use
Pi to build some agentic system like
Post AI from scratch, which is agent
that designed to launching and running a
business. But before we dive into Pi, I
know a lot of you already using coding
agent like Cloud Code or Codec everyday.
But this probably a 10 or even 100X
difference between someone who just open
terminal, send a prompt, and hopes for
the best versus someone who fully
utilize every aspect of what this modern
harness provides. Things like what type
of Cloud or MD or agent.md actually
works, how you structure code base that
is agent ready, what are hooks that up,
and how to keep a long running work on
track with task state, and how to run
more post sessions without creating a
complete mess. If you want to be on the
right side of gap, then this free Cloud
Code Playbook I put together with
HubSpot will get you there. This is a
playbook I wish I had when I was
figuring all this out the hard way. It
covers my prompting patterns, how I set
up my Cloud or MD and project context,
which hooks and guardrails I use, and
how I manage the task state for longer
work. My favorite part is probably the
parallel sessions setup that enable you
to run not just one or two sessions, but
10 to 15 different agent sessions safely
at the same time. Although it is called
the Cloud Code Playbook, the principles
actually apply to Pi as well. Because
for every Cloud Code feature, there's
almost a equivalent package that you can
plug into your Pi agent, which we will
talk about soon. So most of the
principles here are harness agnostic,
which means no matter which agent you
use, you can adopt it. I put a link in
the description below so you can
download for free. And thanks HubSpot
for sponsoring this video. Now, let's
get back to the Pi agent. So
fundamentally, Pi agent is a coding
agent. And every time when people ask
me, "Hey, is Cloud Code better or Codec
better?" My answer for the past few
weeks just they are same. There's no
real difference between those coding
agents anymore. But why did Open Claw
choose Pi Agent as the base to build
upon? Because CloudCode, CodeX,
OpenCode, they all have their own SDK
and CLI that allow you building new
agent system by wrapping it. Well, the
core difference is all the other coding
agents harness, even though it's really
powerful, you can't really modify or
change how the harness inside it works.
Even CloudCode and CodeX is becoming
increasingly similar to each other, but
each one still have their own unique
features. Like CloudCode has dynamic
workflow, but if you're user of CodeX,
you can't just tell CodeX to say, "Hey,
implement this dynamic workflow as part
of your harness." And vice versa. Even
though they already tried to open up
more customizability by exposing hook
system to the user. And if you don't
know hook, they normally allow you to
define some programmatic behavior when
certain things happen, like when a
session start or before the agent try to
call a tool. So, you can achieve some
sort of harness modifications by doing
things like every time when CloudCode
try to call a tool, it automatically
check a permission rules that you write
and then return back true or false based
on permission rules that you want. It's
pretty powerful, but still a bit
limited. Like, if you look at the GitHub
issues, there are a lot more scenarios
of the hooks that users want to modify,
but couldn't. And this is where Pi Agent
really shine. So, the whole design
philosophy of Pi Agent is that harness
should actually adapt to the user rather
than the other way around. So, at
default, Pi comes with a minimum version
of coding agent. It only has four
critical tools: run bash command, write,
read, and edit files. There's no sub
agents, no agent teams, and don't even
have MCP comes with it. It's very bare
minimum. But, meanwhile, it can be
easily extended with any other features
that you want. They have this concept
called extension. So, users and agents
can just write new extension file to
extend the Pi coding harness. They
expose a whole bunch of things to allow
you to make modifications across the
tools, contexts, hooks, session
management, command UI, almost
everything that you can think of. So,
you can add in new tools, command
shortcut providers, large language model
providers, and they They almost every
single hooks that you will ever need.
So, you can write programmatic behavior
to change and improve the harness. They
even expose the UI itself as well. For
example, I can just customize my Pi
Agent UI to whatever I want, like this
random character. And the cool thing is
that this extension can be written by
you as human or by the agent itself. Pi
Agent has its knowledge baking already
and has full awareness of what kind of
extension already loaded and how to
write the extension. You can just modify
itself on the fly. For example, I can
just tell it, "Hey, I want to see the
weather info in the prompt input. Help
me customize your UI." It will
automatically read the extension doc,
then write a new extension for the
weather widget. Once it's done, you can
just do {slash} reload. It will
immediately reload the latest version of
the harness that it just created with
those extensions. And now you can see
the weather information is showing up
here, just above my prompt input. And
this type of UI customization is just
really small part of all the
possibilities. You can almost ask it to
update things on the fly for any part of
harness. And there's a Pi Agent package
catalog. So, you can install extensions
built by others. So, even though default
Pi Agent don't have any of those
features, we can find almost every
popular Cloud Code Codex feature already
implemented by someone that you can plug
into your Pi Agent, like the Go feature,
the MCP adapter, the Chrome browser
access, the ask user question tool, sub
agents, plan mode, and even dynamic
workflow and computer use. If you want
to enable dynamic workflow, you simply
copy this package of dynamic workflow,
run this command, then reload. Now I can
just give a prompt including keywords
like workflow, then works almost like
Cloud Code's dynamic workflow feature.
It will trigger workflow, and I can also
do {slash} workflow, which will pop up
this workflow UI, and you just get a
very similar, almost identical
experience from the Cloud Code. There
even package that will just turn your Pi
Agent into a Cloud Code or Codex. The
package all special tooling those other
harness has, so you can install and use
that artifact. There even extension that
allow you to play DOM while the agent is
running. And some of the extensions
might not be well-built, but technically
you can actually ask agent update and
build for you. And with this
flexibility, I can already see some
really interesting things that only
possible to be built with pipe. For
example, this one package called Pi
hyper. What it does is that it will
capture every tool call hook for things
like bash command to actually making
sure it pre-processing the bash command
result and only return relevant and
minimum information back to the agent.
For example, previously, if agent is
running Git log to see what are recent
commits, command will include a lot of
information for each commit like hash,
author, date, body, and diff blocks. But
with this package, it will actually
clean things up to show only what
matter. And just by doing this, it can
probably reduce 96% of those type of
commits. And in some other testing
commits, it will all cut token by like
80 to even 90%. And this is a good
example where things like that is just
difficult to implement with cloud code
or codex because their pre-tool use cook
only allow you to append new information
to the tool call rather than directly
modify the tool call result. So, this is
rich extension system is a core that
making Pi agent a super useful and this
exactly how Open Claw started. So, first
what they were building is mainly the
gateway to connect with app Slack and
the web interface while using the Pi
agent as the main agent runtime. So, you
can utilize agent loops, large language
model OS, and the session management,
but also extend it with MCP, memory sub
agent, ACP, and many other things. And
those type of customizability would be
otherwise very difficult to achieve if
Open Claw were using cloud code SDK or
codex CLI. And it's actually pretty easy
to build those extensions. I'm going to
show you a few quick examples. So, to
build extension, you can just create a
dot pi folder in any project folder or
in your root and then add an extensions
folder inside it. And here is a few
examples. So, let's say you want to
modify agent's context to always be
aware of the current Git repo like which
branch it is on, what are the available
work trees, un-staged changes, and
recent commits. We can simply create
extension like this, which is in
TypeScript, and adding a Git function
which will run the Git command get all
those Git related information back,
extract and generate a Git summary. And
then just simply do this
pi.on_before_agent_start
and modify the system prompt, append
additional Git context after the
predefined system prompt. And this is as
simple as it get. Once you put this
extension file here, the next time you
load the pi agent, it will automatically
have those contexts. I can simply ask
it, "What's the Git information here?
Use no tools to answer me." And it will
return back the information. And
meanwhile, you can also easily add
custom tools. Like, what if you want
your pi agent to be able to read what's
in your clipboard? You can simply do
this pi.register_tool,
give it a name, label, description, and
param, then define the actual function
here. With this, if I go copy the
previous Git context extension file, and
I will just ask it, "What's in my
clipboard?" It will use the tool that we
write to get clipboard information. And
we can even build something more
interesting, like this permission gate.
So, the idea is that what if you want
this agent to be used by your team,
where each one might have different
permission access to different level of
information? Instead of message sent
directly to agent, or let the agent
decide whether the user has right
permission, what if we add a permission
check using a cheap and fast small
model? If it's all good, then continue
with agent as normal. But if it is some
dangerous information, you can just stop
the session right away. And here, we
just write another extension. We are
using two different package, which I
will dive a bit deeper. One is a pi
coding agent that allow you to write
extension API, but also this pi AI
package, which is some package from pi
agent that allow you to do large
language model call with any model very
easily. So, we define a small gate model
to use Haiku and output decision whether
it's allowed or denied, plus a
reasoning. Then we package this as small
decide tool, the system prompt, as well
as the user message, which load up both
the policy, which is permission.md file
that user can define on the root, plus
the user request. And we use this
function provided by the pi AI package
to direct call the large language model
and output result. All we need to do is
just when the session start, we will
load up the policy information in the
prompt. And then after every time user
send a message, we're showing message on
the UI saying permission checking, wait
for the large language model result. If
it is denied, then on the UI we will
show this block information and skips
agent entirely. Otherwise, continue like
normal. To test it, you can just define
a permission.md file to define a
specific permission. Like here I said
only Jason can get revenue data. So if I
go to my Pi agent, ask what's the
revenue for June, it will trigger
permission and show me back this
information that is blocked. That you
don't have permission to access revenue
information. So this is one example of
how you can update Pi agent's harness by
writing those extension. And most of the
time you actually don't need to learn
building those extension yourself, cuz
you can just talk to the Pi agent, it
will self-evolve. However, the real
power of Pi, from my point of view, is
actually not just use it as a coding
agent, but actually build on top of Pi
agent to powering your AI products. If
you can look at Pi agent repo, it
actually comes with five different
package. The first one is this AI
package. This is almost like a Vercel AI
SDK that allow you to call different
large language models. It comes with all
the OAuth function to allow your user to
connect cloud code subscription, code
act subscription. So you can actually
use this as standalone function to just
do large language model call in the
application you're building. The second
package is this agent package. This is
basically the agent loop. You can
consider almost this like a Vercel AI
SDK stream text function that has this
small agent loop built in. The third one
is this coding agent. So coding agent
you can use agent core loop as well as
AI package, but comes with this
essential tooling like read, write, add,
and bash, as well as session management,
compassionate context window, the
extension system, as well as SDK. And
this package, you can almost consider as
equivalent to the cloud code agent SDK,
but it is fully customizable and you can
connect to any model you want. And in
the end it also comes with this TUI
package that wraps the coding agent in
this terminal UI. And also a up trader
package. So this up trader package allow
you to build like schedule job or
delegate task to different Pi agent
process. And this is been more
experimental. But you can see that based
on the type of a product you're
building, you can actually utilize the
Pi agent's ecosystem to scaffolding the
agent products. And I actually utilize
this coding agent SDK to build a product
like Posia, which is a a times agent
that can launch and run business to
showcase the real power. And I'm going
to show you very quickly how I build it
to help you draw a picture. So as I
mentioned, I'm using this coding agent
package because it comes with a SDK that
you can use. If you are trying to build
a local agent, which means the agent
system that lives on user's own
computer, then this package basically
give you most of stuff that you need.
And you can just easily extend
functionality by building extension
system, custom UI, and task triggers.
One good example is this all my Pi
coding agent. This is coding agent that
build on top of Pi package. But it comes
with a lot of new tools that brings
performance closer to the cloud code
Codex. It comes with editor type of user
interface inside terminal. It even have
features that allow you to just publish
a specific conversation session you have
with someone else. It has a QR code that
people can scan or a URL you can share
with others. So you can actually build
very sophisticated local agent products
on top of Pi agent. But meanwhile, you
can also use Pi agent package to build
web hosted agent product like this Posia
replica I did. But there are some nuance
you need to handle because the Pi
e-coding agent SDK at default is
designed quite tied to the local file
system. But when you have this web
deployed agent, which means agent run
actually lives on your shared backing
infrastructure. But when you try to
write file, run bash command, then each
user has their own sandbox. With this
type structure, you will need to make
some modifications. Like instead of
using Pi coding agent default session
manager system, which is directly tied
to the general file on the computer, you
probably want to store the session
information in your DB and manage
compassion yourself. And also for the
default bash added read write tools, you
probably want to wrap a layer so that it
will do those operations in the sandbox
that user is owning. But, it is same
situation we need to handle even though
you are using cloud code agent SDK. And
with this, you can also build a web
application like this, which is a chat
agent. User can chat to it. To implement
such experience, we pretty much still
using the pi coding agent package. But
this time we use the default resource
loader. So, this is how you can pass
additional extension skill to the coding
agent. For example, here we define a
extension for guardrail that it will
block by running certain bash commands.
And also define a tool to get MRR with
some mock result. Then we define this
resource loader. So, we can pass on the
directory the agent should be working in
and in the directory where agent should
load extension file like OS key. And you
can also define whether the agent should
just load up extension skills from the
door pi folder. We can also passing
customized extensions. Like here, we are
passing the guardrail's extension that
we define in line here. As well as
additional skills. So, this will allow
you to customize what type of skills
each agent session should have access
to. Then use this create agent session
function to passing the custom tools as
well as a resource loader. And the rest
will be similar. Based on the type of
events, you can present different
information on the UI. So, this is how
you can build a wrong pi package. I
actually use the same pi SDK build a
replica version of post here, which is
hosted agent system that can launch and
run company autonomously. It is using
pi's coding agent SDK as agent runtime.
Breaking down into 11 different agents
with orchestrator that's built around
task entity and persist the state and
context as well as tools proxy. I'll
share more details step-by-step tutorial
of how did I build the system from
scratch in a builder club. So, you can
join if you're interested. Meanwhile,
I'll add some of the extension I build
or some of my own favorite pi extensions
into our curious skill folder. So, you
can give it to pi agent and have it set
up. I hope this is useful. Thank you.
And I'll see you next time.