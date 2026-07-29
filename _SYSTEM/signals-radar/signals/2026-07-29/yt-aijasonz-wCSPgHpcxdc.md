---
type: signal-item
channel: youtube
source: youtube/@AIJasonZ
title: I was using Fable 5 wrong... Cut 35% less token
url: https://www.youtube.com/watch?v=wCSPgHpcxdc
item_id: wCSPgHpcxdc
date: 2026-07-29
signal: "new upload"
tags: [signals]
---

# I was using Fable 5 wrong... Cut 35% less token

You probably experienced your cloud
quota burning out Fable quota so fast
that you hit a limit very quickly. And
that's probably because you are not
using the model right. So, as we get
stronger and stronger frontier model
like Fable 5 or GPT-5.6 so max, even
though those model are extremely
powerful, but also they are expensive
and slow to run. That's why more and
more people, even Cloud Code official,
are recommending this practice that many
use Fable 5 as the advisor or planner,
but use smaller model like Sonnet 5 to
be the executor. Cuz even though Sonnet
5 price is only 20% of Fable 5, but its
performance is almost equivalent to Opus
4.8, which is strongest model a few
months ago. And there are two ways Cloud
Code official has shown. One is that
using Sonnet 5 as the main executor
agent, but only do it to call to get
Fable 5 as the advisor to almost review
its plan and send advice. Or second
method is that you use Fable 5 as the
main agent where it will make a plan and
spin up worker agent using smaller model
for execution. And even Devin is
introducing this new harness type called
Devin Fusion that claim to achieve
similar or even better performance than
Fable 5, but with 35% lower the cost.
And fundamentally, their Fusion harness
is just Cloud Code's Fable 5
orchestrator plus Sonnet 5 worker model.
And Devin actually compare the two
methods Cloud Code mentioned. One is the
Sonnet 5 as the main executor, but use
Fable 5 as advisor versus using Fable 5
as main orchestrator, but spin up a
worker agent using smaller model. And
the recommendation from them is actually
very clear that the Fable 5 orchestrator
model is working a lot better because
with advisor model, you actually need to
pay a very expensive price because
advisor model will need to read the full
conversation history from the main
agent, rather than just trigger a cached
context. And cached token is about only
10% cost of new input token. So, turn
out using this model is actually going
to work a lot better and cost-efficient.
And to make it work well, the main ideas
here is that each agent here should not
be just a basic sub agent, but instead
Devin is calling a sidekick. And what
this means is traditionally, when you
use Cloud Code or Code X and start a sub
agent, it generally just spin up a new
agent session on the fly. And once agent
finish, the last message will be sent
back to the main agent. But, let's say
main agent realize there's something
wrong with it. And when you want to make
edits, the new task tool will basically
spin up a new sub agent session that has
no context of what has been discussed
before, which means a lot of wasted
token on rewriting the same thing. But,
with sidekick model that Devin
mentioned, the key difference here is a
sub agent actually is a persistent
session, which means if the main agent
has some feedback, it will just send
back a follow-up message to the same sub
agent, which will inherit all the past
context. And those past context, since
we're being the cached token, it's going
to be extremely cheap, yet very
powerful, because it has a full context.
And if you're using Cloud Code, you're
probably already pretty familiar with
this model, because that's literally
what agent team means.
You can literally just prompt Cloud Code
to use agent team to do certain task.
Instead of just starting a one-time sub
agent, you can run this persistent
session. Once it's finished, the main
agent will be notified, and it will be
continuously sent a follow-up message to
this persistent agent session, instead
of starting a new session. Cuz the new
Cloud Code version already have the send
message tool that allow you to send a
new message to an existing agent
session. And once those agent finish, it
will stay resumable to receive those
message until it calls a shutdown
request. And when Cloud Code starting a
agent team session, it can even define
the model as well. So, So, you're using
Cloud Code, it's actually very easy for
you to achieve this type of Fable 5S
main coordinator and planner and Sonnet
5 or even smaller model as executor. And
you can achieve this workflow by simply
adding this delegation rules into your
cloud.md file. It's basically saying
that you are the coordinator, that will
be design, design, and review. And we
delegate hands-on execution to the
executor sub-agents using the Sonnet
model. It lists out what are things that
should be delegated and what are things
that should be kept in the coordinator
main agent. Which are specific things
like design, planning, architecture, or
just tiny edits. And there's one section
that's pretty important about road
check. So, the sub-agent would know it a
sub-agent, so it don't keep spinning up
more nested agents. So, with this one, I
can simply start a session asking to
help me design and build a to-do app. It
will ask me question, do some planning,
and typically for complex task, it will
create a frozen spec in the task folder,
then make the plan very clear, so
there's no ambiguity for executor. Then
spin up a sub-agent with Sonnet 5 to do
the actual execution. And the sub-agent
will receive this task saying the role
is executor, do the work themselves,
don't spawn sub-agents, and then read
the spec first, and do the
implementation. And because it is Sonnet
5, it's actually going to be much faster
than you implementing with the Fable 5.
And I have included my delegation rules
in the AI Builder Club GitHub repo. So,
you can copy and insert into your own
cloud.md. If you're interested in
learning more, there are more
step-by-step tutorial on this coding
agent workflow, and we have weekly live
workshop to cover those. I have included
link in the description below, so you
can come and join if you're interested.
However, this only works if you're using
Cloud Code. But in reality, probably you
have a few different AI coding agent
that you're using. Some of you probably
using Gemini CRI because the Gemini
model is still one of the best and
cost-effective model for front-end
design, or the recent Kimi case 3 model.
So, in an ideal world, you still want to
use the best possible model and harness
as a coordinator, which can be the Cloud
Code or Codex using the GPT- 5.6 So Max.
But the actual worker you should be able
to free to use any of those based on
your preference. And Codex team has been
pretty sneaky. They introduced this
Codex plugin CC tool, which is a Cloud
Code plugin that allow you to delegate
task to a Codex agent. So you just
install this plugin and add the OpenAI
Codex, then reload plugins. And now I
can prompt it to delegate to Codex agent
to help improve our UI of to-do app on
this URL, which is first version that
our Cloud Code agent did. And then it
will start this Codex session. And here
is a bit of weird cuz it basically start
a sub-agent to call this Codex agent.
It's probably because our
coordinator/executor
setup in cloud.md. But while it is
running, you can see this Codex plugin
giving us a few command. One is Codex
rescue. This basically treat Codex as a
sub-agent. Or a Codex review, which
allow you to get a Codex to review the
local git. And Codex result allow Cloud
Code to fetch the output from a specific
Codex session. Same as Codex cancel. And
it can even do Codex transfer, which
should basically take the conversation
history to this point but fork over on
Codex side. Now if I check my to-do app
again, you can see that it update the
UI, which looks probably more OpenAI-ish
while the Entropic feeling. The one
limitation with this Codex plugin is
that I don't think there's a way for you
to keep sending message to the same
Codex session. If here I ask it to, "Can
you send a follow-up message to this
Codex session to say good job?" Oh,
actually I am wrong. It actually can
send back message cuz there's a resume
command, which will allow it to send
message to the existing session. So it
can actually achieve that by doing this
hack. So, the bridge between CodeX and
Claude Code is pretty much there. But,
what if you wanted to actually talk to
any other coding agent that you are
using like Gemini CLI, Guark Build, Pi
Agent, Open Claw, any others. This is
actually a way by using Tmux. So, if you
don't know, Tmux is basically a terminal
multiplexer. It allows you to start
multiple different persist terminal
sessions and continuously read and
manipulate any other terminals. For
example, I can run this Tmux split
window -h, which means it will start a
new terminal session on the right side
of the screen. And inside that terminal
session, I want to run Claude Arsay and
with this message. It will spin up a new
session on the right and send out this
message. And what's cool is that on one
hand, this session is persist. You can
continuously sending more message to it.
For example, I can do Tmux send keys t,
which is the target, and dollar one
means the second terminal sessions on
the screen, "Tell me a joke." And then,
I'll do Tmux send keys enter. This one
will basically control the terminal on
the right side to typing this message
and click enter to send out message. And
once I run that, you can see on the
right side, a new message has been sent.
And I can also run this Tmux capture
pane -p -t .1. So, this means it will
actually capture what's showing on that
terminal and print out the result. So,
if I click enter that, then it will read
the result from the screen on the right
side and return that result in the
terminal. So, with this one, you
probably start getting the idea that you
can just tell your agent to use Tmux to
start new agent session just like you as
human. And through that way, it can
technically control any coding agent and
use that as a real agent teams. The only
caveat here is that it's easy for you to
start new session in this way. But, how
can the the agent actually notify back
the main agent that it has finished task
or it needs some help. So, there are
some hacks you can do. So, in tmux,
there's a way for each terminal to send
signals like
by doing this wait for -s with a
message. So, what do you technically can
do is start a tmux session and instruct
agent that once it's finished send this
special message. And then run this tmux
wait for this special message. You can
even just pipe and printing out the
section after it finish. So, if I do
that, it will restart the new agent
session and once it finish, it will run
this tmux wait for down hello world page
command so that this command will
finish. And you can imagine you can
basically instruct your agent to follow
this pattern, run background command so
that once it finish, it will be
notified. And I actually created a skill
called open agent teams. It's basically
encapsulating this tmux hack alongside
reference and adapter for each harness
like cloud code, code ask, grok pi, open
code and maybe others you can add to
achieve those kind of agent team
experience for any agent. And it
actually kind of works in any terminal
you're using. Like I can just open a
normal terminal and start grok and just
give a command. Ask code ask to make a
joke about engineer who write code and
after finish delegate to pi agent to
review the joke and also cloud code high
cool model to check the grammar in
parallel. And after all finish, you do
the final review and tell me. Right, so
you can do things like this. And with
this skill, I actually encapsulated the
short script that is encapsulating all
those tmux kind of practice but exposing
like start a new agent session, send
message to a session, wait for the
result, see the result, things like
that. So, you can see if firstly run
this command, start a code ask session
and this is kind of ID with a prompt,
then it run this peak command to quickly
check if this session actually running
well Cuz sometimes those coding agent
session can have those kind of
permission confirmation screen. And in
this case, it is working well, then it
will run this command to wait for the
session to finish with a max timeout.
And the session is running in the
background. And once finished, it will
do this result check. And here you can
see that the Codex actually wrote a
summary, but the summary didn't include
joke itself. So, then it can send a new
message to a specific session to ask to
print out the result. Then it got a
joke, stopped the Codex session, start a
pie review session for this specific
joke. And meanwhile, also start a haiku
grammar session with a special prompt.
And you can see there's some issues that
is blocked by the classifier. So,
there's probably some improvements that
we can do for the script as well, but it
is able to just self-healing and wait
for the result from both this pie review
and haiku grammar check. And also see
that the haiku grammar session is in
this kind of interactive mode. Then it
was able to just do the enter to control
this terminal session. And in the end,
return back the final version to me. And
I have included this open agent team
skill inside the AI Build Club repo
here. So, you can just copy and use. It
has this skill file talking about how to
use this script and also a reference
file for the cloud.md or agent.md file
that including this delegation rule
section. So, you can just copy paste
over. But meanwhile, if you really want
kind of premium experience, there are
also two like Herd and Orca that has
those orchestration CLI feature built in
and pair with a kind of UI layer. So,
it's pretty easy for you to see the
result. And I test almost all those
options. Personally, I found Orca is
providing the best experience. So, Orca
has this orchestration skills, which is
a CLI plus Q come out of box. And you
can basically install it. And once you
install that, it is basically achieving
the similar open agent delegations in
there I have to here. But because it's
very tied to the interface they have
here, the experience became very
intuitive. I'll give you one example.
Let's say I just start a kind of new
report, and in this report we don't have
any uh skills. It just have that
orchestration skill come out of box. I
can basically tell the same thing, like
help me ask Codex to make a joke about
any new whoop code. After finish
delegate to Pi, except I will also add
the skill to just make it more explicit.
Sometimes they will just do it by itself
as well. But just for demo purpose, if I
enter this, it will use the skill which
will invoke Orcas kind of still I that
they build in. And then first they start
a Codex session. But the really cool
thing here is that you can see this new
session just pop up on the right side.
So, it's actually very easy for me to
see all the sessions end-to-end, and I
can just put the sub-agent session on
the same screen here. Uh and on the left
side, I just have this kind of hierarchy
view to show me what are the
sub-sessions under the session. The same
thing, it also start this Pi agent for
the review, as well as this Haiku agent
for the grammar check. And again,
everything is just very well tracked in
their interface. I can just go into any
sub-agent to continue the conversation
there, and uh once I finish it will like
automatically communicate back to the
main agent. And I believe they will even
have some kind of special data
visualization to help you see how the
tasks orchestrated across different
agents. So, if you want a more kind of
packaged experience, I highly recommend
you check out Orcas well. They do have
so many good stuff built in, like the
Orca mobile experience, the Kanban view
out of box, the token usage tracking,
all the good stuff. And it's totally
open source and free, and they're
growing like really, really fast. For
the past few weeks, it has been my daily
driver for communicating with agents for
the past few weeks. And we actually did
a 1-hour deep dive workshop on some of
advanced AI coding workflow with Alka
founder. We actually showcase
step-by-step of how they were managing
to ship hundreds of commits to the Alka
product itself. In Octrade advanced
agent workflow across Grok, Codex, Cloud
Code, Open Code. You can also join AI
Build Club to see the in-depth workshop.
So, I hope you enjoyed this video. As
mentioned, feel free to get the skills
that I put in for either using this open
agent team skill as well as this
Contagion Rules section for your
cloud.md or agent.md file to achieve
those kind of Octrader worker setup. So,
that's pretty much for it today. Thank
you and I see you next time.