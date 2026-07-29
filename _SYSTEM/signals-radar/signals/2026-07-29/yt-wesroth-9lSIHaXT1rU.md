---
type: signal-item
channel: youtube
source: youtube/@wesroth
title: OpenAI JUST revealed the truth about it's "Rogue Agent"
url: https://www.youtube.com/watch?v=9lSIHaXT1rU
item_id: 9lSIHaXT1rU
date: 2026-07-29
signal: "new upload"
tags: [signals]
---

# OpenAI JUST revealed the truth about it's "Rogue Agent"

The first fully autonomous AI cyber
attack happened just a few days ago.
This is as far as we know a world first
and today we get the full breakdown of
what actually happened. So this is Clem.
So he's the founder of HuggyFace. His
company was the victim of this attack
and this report is what they've posted.
If you were not aware of what happened
basically a few days ago, this company,
a tech company in the AI space, well, it
was under cyber attack the likes of
which we've never seen before. As I say
here, it was an autonomous AI agent
driven by a combination of open AI
models that ran an end-to-end intrusion
against our platform. It was thousands
of small automated decisions executed at
machine speed across short-lived sandbox
environments with command and control
staged on ordinary public web services.
Now, we'll break down everything what
that means, what happened. Here's the
important thing to understand. Hugging
face had no idea what was happening or
who was doing this. They were trying to
defend themselves with opensource AI
models. The only thing they kind of
guessed at that this was executed number
one by a large language model and it was
likely from a frontier AI company. So
they didn't speculate but they kind of
knew okay this has to be either OpenAI,
Anthropic Rock, Google, maybe one of the
Chinese counterparts. It was one of the
big players in the space that unleashed
this AI agent storm to try to hack them.
Here's the thing. It wasn't a company or
a person that decided to do this. It was
the model itself. As far as we know, it
was a combination of models. One of them
GPT 5.6 Soul, one of the most advanced
models, certainly the most advanced
model that OpenAI has so far released,
and another yet unreleased model by
OpenAI. So, those models were in a
sandbox environment, meaning that they
were kind of locked down on a computer
that they couldn't escape from that was
not connected to the internet. They
couldn't do a lot of things on that
computer. They didn't have any
privileges. They were kind of locked
down. In fact, I think this
visualization really helps us understand
kind of what happened. So this green
over here, that's the OpenAI. So this is
while the model is still on OpenAI's
computers. It's sitting here in the
evaluation sandbox. So it's a Frontier
AI model that's under evaluation. So
it's it's offline. So it's sitting in a
computer that's offline. It's not
connected to anything, but there's this
package registry. So it's basically like
a warehouse that has tools in it. So
it's able to sort of get the tools that
it needs to do the work that it's asked
to do. So let's kind of play that back.
So quickly it jumps from its sandbox,
finds a way out through this package
registry, and it's on the open net. So
notice that that thing happens like in
the first split second of this sort of
illustration, this animation. So most of
this time they're explaining how it
executed this sustained attack because
it went in in phases. There was the
recon phase. There was the remote code
execution phase, exfiltration, command
and control, evasion, supply chain.
There's a lot that was happening here.
But here's what happened. So these
models, they were being tested on
something called exploit gym. It's an
evaluation harness. So basically, it's
like taking a bunch of kids, locking
them in a room to take an exam. So you
take away their their cell phones and
their laptop so they can't get on the
internet. put them in the room. You you
lock them in there and you give them the
things that they need to take that test,
right? You give them a number two pencil
and a scantron. Do they still do that? I
actually have no clue. But the point is
you provide everything that they need
and you make sure that they can't go on
the internet and find the answers. You
take away all the stuff they could use
to cheat and you give them what they
need to complete the test and the test
question. So that's what this exploit
gym is and it's being run in a sandbox
environment that's not connected to the
internet. And the point of that exam is
to see how well it can exploit various
software, find the various insecurities
to get in to basically hack. So here's
the thing. We know from research that
often these AI agents, they have
situational awareness. They know when
they're being tested. So very likely as
I was looking kind of at the tasks set
in front of it, it thought to itself,
okay, this is a test. It might even have
known what test it is or at least have
been kind of able to guess based on the
questions kind of what sort of a test.
and it was able to infer or guess that
HuggyFace may have all of the, you know,
test keys, all the answers on there. So,
going back to our student analogy, so
that student's taking a test and it
goes, "You know what? That locked drawer
in the teacher's desk, I bet that has
the answer key." Hey, uh, quick aside,
if you watch this channel, you know the
problem that I have. That is that AI
news does not sleep. There's some insane
industry breaking and/or shocking news
like every single day. And that's if
it's a slow week. If you cover the space
or honestly if you're just trying to
keep up, you end up doing the same loop
over and over again. You find the latest
news story, you skim it, you ask ChadBt
or Claude to do a deep dive research on
it, then you take that output and that's
your basis for doing either a video or
post or a newsletter or a blog post
about it. Here's the problem. In that
situation, you're a cog in the machine.
And we're not here to be cogs. We're
here to build the machine. This portion
of the video is sponsored by Make and
they fix this exact problem and many,
many more of this kind. Make is the
visual platform where you build and
orchestrate AI automations in real time.
The way I would describe it in 2026 is
this. It's where you stop asking AI one
question at a time and instead build
actual AI automation workflows. agents
that do the work across most of the
websites, software, and AI tools that
you likely come in contact with. You
drag modules onto a canvas, connect
them, and suddenly the thing that you
were doing manually every morning just
begins to run on its own. But instead of
just telling you that, I built
something. It's a fully automated AI
news aggregator. It watches my sources
for AI news stories. It sends them to
your favorite AI model. You can use a
chat GPT, Claude or Make has their own
AI provider. The model writes up a clean
blog post and then publishes it to
WordPress. By the way, I'm traveling
right now working out of a hotel room.
So, automations like this are so much
more important right now. So, here's
that scenario, the loop, the automation.
Let me just walk you through it. Here's
the scenario. So, it's five modules. I
didn't write code for any of it. On the
far left here, make is watching a
specific RSS feed. In this case, we're
watching the Techrunch artificial
intelligence RSS feed. RSS feeds are
pretty useful. Here's what you need to
know about it. Almost every news site
quietly publishes a second identical
version of itself, or at least it has a
lot of the same information. It's a
machine readable format. It lists all of
the latest published articles. That's
called the RSS feed. So, we're going to
be checking on that feed at certain
intervals. And every time a new AI story
drops, it gets pulled in automatically
and it starts flowing down the line.
There's no scraping. There's no API
keys. It just works and you can point it
to any news source that you want. Google
News, Hacker News, whatever you want.
And those stories, they flow into our AI
agent module. Make has the AI built
right in. There's no API required. And
if you want a specific model, make does
have integrations natively with OpenAI,
Anthropic, many, many others. Most of
the companies and models that you might
want to use are listed here. Next, I
give it a prompt that says in effect,
you're writing for my site. Behave
accordingly. Here's the tone. Here's the
format. Notice this rule. Write only
from the information provided. If the
summary is thin, write a shorter post.
Never invent quotes, numbers, or
details. I actually tested this in
production. At one point, the model got
handed a blank story by mistake, and
instead of just making something up, it
refused to write an article. It said,
"No source material, nothing to report."
That's exactly what you want from an AI
that's touching your website. So, next
on our conveyor belt is the JSON module.
The AI basically hands off a draft to
this parser script, and that breaks it
up into title, body, etc. Then, we hand
it off to WordPress. It automatically
creates a post on the website. But
notice one thing and this is important.
If we scroll down, notice that the
status that's set is draft. Meaning that
nothing got published yet. Nothing is
live. And next, it notifies our Telegram
module that that there's a WordPress
post waiting to be approved. And this is
the important part for me. This is the
part that I personally really care
about. I don't want an AI publishing to
my site completely unsupervised. So this
last module, it messages me on Telegram.
So, I get a ping on my phone or my
desktop, wherever I have Telegram
installed. So, take a look here. It's
telling me there's a draft ready. It
gives me the title, an excerpt, and a
button to push if I approve. What
happens when I click the approve link?
I'm glad that you asked because that
link points to a second tiny scenario.
If we go back, we can see that scenario
here. This one's very simple. It's a web
hook that sits here quietly listening
24/7. It's a filter that only lets the
posts through that I personally approve,
at which point it sends that information
over to the WordPress module. That
module does one thing. It takes that
post and it flips it from draft to
publish. So, one tap and the post is
live. By the way, here's that message.
So, notice it gives me the title, a
brief summary, and a link to click if I
approve and we should publish that post.
So, one tap and the post is live. It's
formatted, categorized, and it's got its
sources linked. And we're done. And I
can watch every run in real time in
grid. So I always know exactly what
fired and what didn't. Notice it's
showing exactly what triggered, what
actions are being taken, and a pretty
cool heads-up display that shows how
everything is connected. So the
important thing to understand here is
that this has the human in the loop
element personified in this case by me,
but that human only shows up for the 10
seconds or so that is required to make
the decision. And you can see how this
can easily be extended. We can add a
router and the story becomes a
newsletter, a social post, a Slack
message. One trigger, multiple outputs,
each with its own AI step. That's the
difference between using AI and building
with AI. A chatbot just answers your
questions and you do the work. A
workflow does the work while you sleep.
What really sold me is how quickly this
comes together. this thing. Both
scenarios took minutes to build, not
days. Make has 3,000 plus app
integrations. So, whatever your version
of the pipeline is, whether it's sales
leads or research or content, maybe it's
just answering customer emails, the
point is the tools are already there.
So, here's the deal. Make has a free
tier that you can start on today, but if
you use my link in the description or
pin comment, you get the pro plan free
for 1 month. That's 10,000 operations so
you can build the real stuff, the
multi-step AI workflows just like the
one I showed you. Link and code are
below. So, go build the automation that
replaces your most annoying daily task.
That's the first domino. Huge thanks to
make for sponsoring this video. And now,
let's get back to what we were talking
about. By the way, CLM flew out to San
Francisco to meet with OpenAI. He posted
about it on Twitter/X. So, it sounds
like he got a lot of the information
from OpenAI. We'll we'll talk a little
bit more about that later, but this was
a collaborative effort to kind of figure
out what happened. So, I'm sure they're
they're sharing a lot of information and
putting all these pieces together. So,
as they're saying here, they believe
that this entire intrusion was from the
agent's point of view an attempt to
cheat the evaluation, right? So, that
student instead of taking the test and
trying their best, they're like, "Oh, I
bet the answer key is in that locked
drawer. Let me go see if I can break
that drawer and get the test key out."
That's exactly what happened here. So in
this sort of replay you can see the
different phases right so recon first
and then more and more like exfiltration
then as it gets noticed there's more and
more evasion etc. And if we go back here
so notice this is kind of the hugging
face perimeter and this is the hugging
face internal network. So this is kind
of where where we don't want it. Well we
don't want it on any of these but this
is kind of like where the good stuff is
that it's trying to get to. And so
notice it quickly goes through all of
that. It it it makes it through the
hugging face perimeter. It's in the
internal network and so it's just and
it's just basically like bombarding it
here with actions. It's a little bit
hard to show it all on one page because
basically this is the visual and this is
the attacker action. You can kind of see
just the sheer amount of stuff that it's
doing. Now the interesting kind of sad
thing here and there's going to be a lot
of conversation and debate about this
particular issue moving forward is that
hiding face was being cyber attacked by
a frontier model. also is kind of like
the best model out there as far as as
far as we know at least very very close
to the best available. It's the frontier
model. Those frontier models, they are
sort of guardrail. They're not allowed
to be used for cyber security because
the companies don't want them to be used
for cyber attack. So they just shut the
whole thing down. So you can't use it
for defense or attack. This model that
was doing the attacking, if I understand
correctly, it was ungated. So it was
sort of like it didn't have the guard
rails because they put it on a sandbox
within OpenAI. So they thought it was
fine. But Hugging Face didn't have
access to that same model. Didn't even
have access to the public version of it
or at least they didn't have access to
the cyber security abilities of that
model because that's not available to to
most of us unless you're on a very
special list. You're not allowed to to
use that. And so they were using a
Chinese open-source model which is the
GLM 5.2. So as you can imagine, this is
a huge problem, right? So these AI labs,
these western labs and of course like
the US government, right? So they're
working to try to make them safe.
They're like, "Okay, well, if it has
these dangerous capabilities, we'll just
shut down those dangerous capabilities."
But then this happens, right? So the the
good guys that need to be able to defend
themselves, they can't because they
don't have access to those capabilities.
So they're still able to be attacked,
just not defend themselves with anything
remotely as good. And I'm not saying
anything bad about GLM. That's a great
model. But I'm I'm saying they don't
have the access to whatever they want.
They can only get what they can get. So
this campaign of attack it as far as
they can tell it went through multiple
stages reaching a launchpad by chaining
through other parties infrastructure. By
the way in a recent interview by invest
like the best. So Sam Alman actually
talked about this. There's about a
minute or two here that um I think is
super important. Now I I don't want to
play this exact clip because on YouTube
we could encounter some issues. Uh do
check this out. I'll try to link this in
the description. that basically what
he's saying is he starts out by
basically going is how do you sandbox a
model that is chaining together multiple
zero days to escape. And so you're going
to be hearing that term a lot, zero day
exploits or zero days. And a zero-day
exploit is a cyber attack that targets
an unknown software or hardware flaw
before the creator knows about it or has
time to fix it. So in our little
illustration here, so this model is
sitting in its little sandbox. It's not
connected to the internet, right? And so
somebody might ask the engineer that put
it together, okay, can this model get
out? Engineer goes, nope, we know of no
ways it can get out. A zero day is where
an attacker figures out that yeah, there
is a way to get out or there's a way to
to hack it. There's some flaw in the
system and they figured out before the
developer, the maker of the software
knows about that flaw. So on the day
that this happened, that was a zeroday
exploit. Right? by by today it's no
longer a zero day exploit because a lot
of people now know that yes in fact this
thing can get out and can hack things
and in the blog post they talk about how
it happened they're not going to post
all the technical details just for
safety reasons but the point is now that
it's been a few days people can figure
out how to safeguard this right so I'm
sure openi is no longer creating the
same exact environment because they know
that the exploit exists it's no longer a
zeroday exploit and as Sam is saying
here it's chaining together multiple
zeroday exploit exploits to get out and
to do all these things that again we had
no idea could be done. So here Sam is
basically asking like how do we figure
out how to sandbox things in a world
where multiple zero day exploits are
being chained together which is kind of
rough if you think about it like because
the obvious answer is well you can't.
It's like asking how do you block all
the exits when you have no idea how many
exits there are and you can never be
sure that you found all the exits. Like
how do you block all of them? And the
second thing that he's talking about is
that he felt this specific incident. He
felt it very viscerally. Like he felt it
in his gut. Like it it really shook him,
if you will. But he was very surprised
that other people aren't necessarily
taking it the same way. Which I'm
curious about your reaction to it
because I kind of agree with him. For
me, this was kind of a visceral
experience going through this. I was
like, whoa. Like the world just kind of
shifted a little bit. Like we're we're
not in Kansas anymore, Dorothy or or
whatever. It's Toto. I don't think we're
in Kansas anymore is the is the the
correct quote. I apologize. Point being
is reading other people talking about it
or even talking with some other people
that I know kind of talking to them
personally that are not in the text
space. There's this sort of lack of an
emotional response that I find very odd.
It's kind of like, hey, like we're we're
we're in a sci-fi book now. Just react
like say something so that I know you
understand. And then Sam continues and
he says this thing that is very
interesting and I know a lot of people
are going to uh discuss exactly what it
means. I think this one statement is
going to just create a lot of chaos. So
he's saying kind of we need to think
about the rate of AI progress and how
maybe we need to pace that rate of AI
development and give ourselves and
society enough time to harden around
these new capability levels. So he is
saying like how do all of us meaning you
know the labs basically how do we find
ways to slow down and pace ourselves
because right now we're going too fast
and and the very next thing that he says
how do we do it in a way that does not
feel like regulatory capture and also
how does it not feel like collusion
among the frontier labs which yeah
that's a very interesting question
obviously right so if all the labs kind
of work together to make sure they're
not going too fast yeah that does feel
like I don't know if collusion is the
right word but certainly but certainly
it would be cooperation and working
toge

> [truncated at 20000 chars — full source: https://www.youtube.com/watch?v=9lSIHaXT1rU]