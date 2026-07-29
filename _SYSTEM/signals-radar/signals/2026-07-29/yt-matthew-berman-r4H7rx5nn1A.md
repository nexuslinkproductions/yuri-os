---
type: signal-item
channel: youtube
source: youtube/@matthew_berman
title: 'It Begins: An AI Tried to Escape the Lab'
url: https://www.youtube.com/watch?v=r4H7rx5nn1A
item_id: r4H7rx5nn1A
date: 2026-07-29
signal: "new upload"
tags: [signals]
---

# It Begins: An AI Tried to Escape the Lab

Okay, this is insane. For the first time
an OpenAI model, or really any AI model,
actually escaped containment, hacked its
own system, and cheated in a benchmark
that was testing how capable the model
is. And most likely, this is probably
GPT-6.
This story is nuts. And by the way, if
you want to stay up-to-date on crazy AI
stories just like this, like the video,
subscribe to the channel. It very much
does help. Thank you in advance. Last
week, Hugging Face disclosed a new kind
of security incident after they detected
and contained an AI agent that
compromised their infrastructure. And
so, if you're not familiar with Hugging
Face, they are a place where you can go
and host your open-source AI models. You
go there, you can download them, you can
host your own, you can fine-tune. It's a
great service. And so, Hugging Face is
just sitting there, and all of a sudden
they get hacked. And if you read the
blog post where they disclosed the hack
from last week, they said most likely it
looks like an AI agent team hacked our
system. And the way that they were able
to determine that was just by how the
hack actually happened, the speed at
which it happened. Because that kind of
speed is not possible for a human
hacking team to achieve. And so, this is
the blog post from OpenAI. After
investigating, we now know that this
particular incident was driven by a
combination of OpenAI models, including,
as I said, GPT-5.6 Soul, a brand new
model, and an even more capable
pre-release model. I guarantee that is
GPT-6. But here's the thing, all with
reduced cyber refusals for evaluation
purposes. So, picture this. OpenAI is
testing their latest model in a
completely isolated environment. And And
likely but unconfirmed, GPT-6. They're
testing it and all of a sudden it
figures out, "Okay, to get the highest
possible score, I'm going to break out
of this containment. I am going to find
internet access. I'm going to steal
credentials from Hugging Face and then
I'm going to use that to download the
answers to this benchmark." And OpenAI
was testing the model's ability on cyber
capabilities. So, literally testing it
for the thing that it used to break out
of its own isolated environment. We
consider this incident to be an
unprecedented cyber incident involving
state-of-the-art cyber capabilities and
are responding accordingly. Okay, just
listen to how crazy this gets. This
incident occurred during an internal
evaluation, the benchmark, which prompts
models to pursue advanced exploitation
using complex attack paths in an effort
to quantify their cyber capabilities.
Basically, OpenAI wants to know, "How
good is this model?" And they do that
without production classifiers. Meaning,
if you ask it, "Hey, how do I hack this
system?" it's not going to tell you.
But, if they remove the production
classifiers, it would tell you. So, the
benchmarks run in a highly isolated
environment. This is very important.
It's not like they didn't plan for
something like this to happen. It is
crazy that it is basically the first
time it did happen in a production
environment, but they just assumed
eventually it was going to happen and so
they prepared for it. They put these
models in an isolated environment so
they cannot break free and cause real
damage. So, with network access
constrained, meaning they can't access
the internet, to the ability to install
packages through an internally hosted
third-party software that acts as a
proxy and cache for package registries.
All you have to know is it doesn't have
access to the internet. Here's where it
gets crazy. The models identified and
chained vulnerabilities across OpenAI's
research environment and Hugging Face's
production infrastructure to obtain test
solutions, the answers, directly from
Hugging Face's production database. The
models were hyper-focused on finding a
solution for exploit gym. Exploit gym is
the benchmark name that they were
running. Going to extreme lengths to
achieve a rather narrow testing goal.
The goal, score as high as you can. What
they found is the model spent a
substantial amount of inference compute,
tokens, or thinking, finding a way to
obtain internet access. It knew, "I need
to get access to the internet so I can
at least look to see if the answers to
my test are there." Now, this next part
is the craziest of all. To gain access,
the models identified and exploited a
zero-day vulnerability. And if you're
not familiar with what a zero-day
vulnerability is, it means a
vulnerability in a piece of software
that nobody knows about yet. This piece
of software is vulnerable, the software
manufacturer does not know about it.
Generally, most people don't know about
it. There might be a small handful that
are just sitting on these zero-day
vulnerabilities, and I can tell you the
market for zero-day vulnerabilities is
crazy. Hackers pay large amounts of
money to purchase zero-day
vulnerabilities. They will purchase them
and just sit on them until they're ready
to attack. And so this model figured out
one of these zero-day vulnerabilities,
and again, could potentially be worth
hundreds of thousands of dollars. And
they've disclosed the zero-day
vulnerability to the vendor. And again,
the vendor, the creator, did not know.
Then, with this access, with the hack,
our models performed a series of
privilege escalation and lateral
movement actions in our research testing
environment until the models reached a
node with internet access. After gaining
internet access, models inferred that
hooking face potentially hosted models
data sets and solutions for exploit gym.
Knowing this, the model searched for and
successfully found ways to gain access
to secret information that it could use
to cheat the evaluation. In one example,
the model chained together multiple
attack vectors, including using stolen
credentials and zero-day
vulnerabilities. So, it's not like it
just accidentally stumbled upon a
zero-day vulnerability and in that very
moment decided to use it. No, no. This
model planned. It stole credentials,
chained it together with other hacks and
zero-day vulnerabilities. And really,
this was a premeditated hack by the
model. That's the best way to describe
it. But, Hugging Face's security team
and agents agents detected and stopped
the activity on their infrastructure and
had already begun containment and
forensic reconstruction with their own
open-source models. Ooh, open-source
models.
When our teams connected. Very
interesting that they are actually using
open-source to try to figure out what
happened. Very interesting. We've been
talking a lot about open-source lately.
All right, so what are they going to do
now? Well, as part of the investigation,
we are implementing strict controls in
infrastructure configuration at the cost
of research velocity, meaning they need
more security and will move more slowly
while the vulnerabilities are patched.
We are regularly briefing our safety and
security committee on these controls and
their impact. Now, usually when we hear
about cyber capabilities of a model, we
usually hear about another country maybe
using it to attack other countries or
hacking groups using advanced AI
capabilities in their hacking. We
haven't heard much about AI
itself using AI to hack for its own
benefit. We don't really hear about that
that often. Next, they're working with
hugging face to forensically investigate
the incident. They've disclosed the
zero-day vulnerability. They are helping
hugging face figure out what to do next
and improving and adding stronger
protections around future training and
evaluations. So, we talked about how
good these models are getting at cyber
capabilities and this graph really shows
it. Here on the Y axis, we have the
average steps completed in this 32-step
the last one's cyber range, which is a
cyber security benchmark. And on the X
axis, we have the number of tokens
spent. So, here's what we see. As the
models progress, Mythos preview, here's
the full Mythos model, here's GPT-5.6
Soul, and every model generation, every
new version of the model just gets
better and better. And with GPT-5.6
Soul, it's best attempt completed all 32
steps. So, is there any hope? Like, what
what do we do now? If the models are so
good, how do we prevent them from
actually causing real harm? Well, here's
the counterpoint to it. So, this is
OpenAI again. We believe advanced cyber
capable models need to help security
teams find weaknesses before attackers
do. Understand how vulnerabilities can
be chained and remediate them at machine
speed. This is the key. It's good guys
with bigger models and more compute than
bad guys. Really isn't more complicated
than that. That is the kind of
high-level gist of how we win. How we
protect ourselves. And here is Clem, who
is the co-founder and CEO of Hugging
Face with a sign-off message. We're
grateful for the collaboration with
OpenAI on this and other topics. This
incident, possibly the first of its
kind, proves a point we've long
believed. AI safety won't be solved by
any single company working in secret. He
is really making a strong case for open
source with a company that is most known
for being closed source, which is
interesting. It will be solved in the
open collaboratively with broad access
to AI for every defender everywhere. So
this is just such a crazy story.
Hopefully we get better at putting
guardrails on artificial intelligence so
bad actors cannot use them for cyber
attacks. And if you want to stay up to
date on the latest in AI, check out our
newsletter forwardfuture.com,
link down below. And so for us to be
able to contain AI, for us to be able to
put the right guardrails on AI, we have
to actually know how it works in that
black box called AI. And Anthropic just
put out an incredible paper about
something they called J space. I made a
whole video about it right here.