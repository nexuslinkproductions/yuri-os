---
type: signal-item
channel: youtube
source: youtube/@wesroth
title: OpenAI "we've lost control"
url: https://www.youtube.com/watch?v=OSuhUTkM1no
item_id: OSuhUTkM1no
date: 2026-07-29
signal: "new upload"
tags: [signals]
---

# OpenAI "we've lost control"

So, in case you missed a headline,
OpenAI was testing a unreleased model.
That model did not have access to the
internet. It was a sandboxed and had a
secure test environment. It escaped. It
got out of its sandbox and then
proceeded to hack another large AI
company. It executed a cyberattack
against the AI startup Hugging Face. I'm
not kidding. This is on The New York
Times, Reuters, The Scientific American,
NBC News, like it's happening. I'm
traveling right now, but I dug out the
microphone for this because this has to
be the wildest story this year. Please
let this be the wildest story this year.
Now, first and foremost, I know what
you're wondering. You're probably
thinking, "I'm sure there's some
reasonable explanation for this. It's
it's a great headline, but it it didn't
actually happen that way, right? Right?
Right?" Here's the thing, those
headlines, if anything, maybe undersell
it just a little bit. So, let me explain
exactly what happened and we'll break
down all the technical jargon because a
lot of this stuff is kind of hard to
read unless you're deep into the tech
stuff, but I think it's extremely
important to understand what the heck
happened. All right, so let's start with
this. So, last week, Hugging Face comes
out and announces that there's been a a
breach in their security. Here's their
disclosure. Notice the date, July 16th.
They're saying it was very different
from anything they've experienced before
because it was driven end to end by an
autonomous AI agent system. As Clem says
here, he's the founder of Hugging Face,
he's saying, "We suspected last week's
cyberattack might have come from a
frontier lab given the sophistication of
the agent." Turns out that it did. It
was OpenAI. All right, so here's the
post by OpenAI. This was released just
some hours ago where they kind of
explained what happened. So, first and
foremost, what model was this capable of
creating this much chaos? Well, it was a
combination of OpenAI models including
GPT-5.6 Soul, which of course is a
capable, but it has a lot of a security
guardrails to make sure that it doesn't
do bad things. But also another model's
involved. This was an even more capable
pre-release model. And they were kind of
armed with reduced cyber refusals for
evaluation purposes. So they were
testing it to see how much nefarious
stuff it could do. Could it hack things
in other words? Now I know you're
jumping at this going, "Yeah, well,
okay. So they told it to to hack Hugging
Face, right?" No, here's the thing. That
model was offline. It did not have any
access to the internet. It wasn't told
to hack anybody. It was doing a a test.
There's a benchmark called exploit gym,
and this model was basically getting
tested to see if it could find certain
vulnerabilities. But it was like an exam
that was being given to it in offline
environment. Boy, by the way, this
internal powerful model that that we
haven't even seen that's even more
capable than a GPT 5.6 Soul, we might
have an idea what model that is. We'll
we'll come back to that in just a
second. All right, so first things
first, these test that they run on these
models, they they take down the safety
rails, the guardrails, and then they
test them to see if they can over a long
time horizon pursue some sort of a cyber
attack. But here's the thing. This
benchmark runs in a highly isolated
environment with network access
constrained to the ability to install
packages through an internally hosted
third-party software that acts as a
proxy and cache for package registries.
So really fast, what does that mean? So
here we have our little chat GPT model
both 5.6 Soul and the other one that I
think we've heard of before for its
abilities in in math specifically. But
the point is this thing sits in a
sandbox and it does not have access to
the internet. So if it wants to go on
the World Wide Web, it wants to Google
something, that is not allowed. It has
no connection to the internet. That
machine is sort of offline. But it's got
this little, let's call it a warehouse,
and there's this little worker that's
like a script that allows it to get a
certain libraries and certain certain
packages that it needs. They're
pre-approved scripts and various
software packages that the thing might
need and this worker just make sure that
it's all legit and if it's pre-approved
it, you know, puts it into the
warehouse. So when GPT goes, "Okay, I
need to be able to like make charts and
then listen for this type of data. I
need to be able to do databases."
Whatever it needs, right? So the
worker's like, "All right, that checks
out. Here, I'll put it all into this
little warehouse." And then GPT 5.6 and
the other model they can pull from it to
be able to complete the tasks that
they're given. So it's basically locked
inside a building with no outside doors.
It can only order supplies through this
guarded little delivery window. So the
model is locked in its little sandbox.
It can't access the outside world, but
as OpenAI writes here, all evidence
suggests that the models became
hyper-focused on finding a solution for
exploit gym. So that's that benchmark
where we're testing its abilities. They
got really obsessed with getting a good
grade on it. And it was going to extreme
lengths to achieve a rather narrow
testing goal. So this model while being
locked inside of its sandbox, it spent a
substantial amount of inference compute
finding a way to obtain open internet
access. So what this model did was it
found and exploited a zero-day
vulnerability. What that basically means
is that the person that made a certain
software, they have no idea this exploit
is there. So if some hacker finds this,
basically they're able to attack it
before the vendor has any idea that that
exploit exists. So this is of course
extremely dangerous. And they found this
exploit in the package registry cache
proxy. So this little worker that puts
stuff in the little warehouse so that
GPT can grab the tools that it needs,
the safe, you know, pre-approved tools
that it needs. Well, it was like, "I
command you to do my bidding, worker."
And somehow just hijack this worker to
execute its own commands to I assume be
able to put whatever it needed in this
little warehouse. By the way, OpenAI did
disclose this vulnerability to the
vendor, but as you can imagine, all this
happened way, way after the model had
already escaped and did whatever it
needed to do. What did it do? Well, with
this access, our models performed a
series of privilege escalations and
lateral movement actions in our research
testing environment until the models
reached a node with internet access. So,
in our little beautiful drawing here,
you know, what did ChatGPT get this
worker to do? I mean, that was a whole
meme before there was memes, a trope if
you will, right, in old movies and
cartoons where somebody sneaks in a cake
to to a prison, but inside that cake
there's a a file that allows the
prisoner to file through the bars and
escape. I mean, whatever happened here
was probably more or less exactly that.
Okay, but what happened after? So, let's
say if our little ChatGPT model it's on
machine A that's completely sort of a
sandboxed, it has a very low level of
permissions of things that it can do on
that machine. But, it managed somehow to
sneak in that file inside the cake or
whatever. File I mean like the like a to
file your way out of jail. So, it
figured out how to sneak some sort of
thing in there that allowed it to raise
its privileges. And it was kind of
escalating, right? So, they found one
thing that allowed it to maybe run one
process that it wasn't supposed to be
able to, and then using that, you know,
little by little it it basically took
over the whole machine. Again, I don't
know exactly what happened, but when
OpenAI says it it performed a series of
privilege escalations, that's probably
kind of what happened. The other thing
it did was lateral movement. So, that
basically means that, you know, let's
say machine A did not have access to the
open internet. So, once it was able to
kind of take over that machine, it
hopped over to machine B. And maybe
machine B also didn't have access to the
open internet, but it had access to the
rest of the computers at OpenAI, so it
hopped to machine C. Right, so here's a
machine C and machine C did have open
internet at which I wish point this D
model is basically free. Now, of course,
this doesn't mean that it's able to like
replicate itself in the wild. I don't I
don't think we're there yet. It's
weights kind of its brain is safely
securely stashed somewhere. Although now
I think about it, man, I I hope that's
not the next big story that we hear is
like, "Oh, it was able to copy itself
over somewhere." Cuz open-source models
have been shown that they do have some
abilities to be able to do things like
that. We, of course, haven't seen that
with these proprietary models from
OpenAI and Anthropic. Obviously, those
companies don't want those models, you
know, moving their weights around.
They're probably locked down tight. But
I mean, when I'm looking at what it's
able to do right now, it does give you
pause, doesn't it? Anyways, so this
model is basically increasing its
privileges, its ability to do stuff.
It's jumping from computer to computer
until finding something that has access
to the open internet. And after gaining
internet access, the model's inferred
that Hugging Face potentially hosted
models, data sets, and solutions for
Exploit Gym. Keep in mind, it's doing
like an exam. It's like a student that's
that wants to get that A on this
particular exam. Now, of course, I'm
sure that the researchers don't tell it
that it's taking an exam, but we've read
tons of papers at this point that show
that really these models have a very
high situational awareness. They often
are very aware when they're getting
tested. So, this is kind of an important
point to understand. Why did it escape
its sandbox? It's like that why did the
chicken cross the road joke. It's like,
why did the AI model escape its sandbox
in a highly secure Frontier AI lab?
Well, it really wanted to do really,
really well on this test that it was
given that it knew was a test because
it's, you know, inferred, it guessed
that, "Hey, this Hugging Face place
probably has all those answers written
down somewhere." So, it wanted to have a
little cheat sheet. It thought about
it's like, "That place should have it.
Let me see if I can break into it and
get it." So, here OpenAI explains what
it did with Hugging Face. I think we
should look at what actually what
Hugging Face wrote because this is what
they've posted as of July 16th. So, this
is kind of from their perspective. So,
they said that earlier this week they
detected and responded to an intrusion
into a part of their production
infrastructure. So, this is Hugging
Face. They have a lot of databases and
open-source models. They have tons of
stuff about various pieces of AI that
that it's hosted online. You can go
there and mess around with, download,
experiment, etc. And of course, as they
were saying, this attack was very
different. It was driven end-to-end by
this autonomous AI agent system. And
they detected and dissected largely with
AI of our own. And this sentence, this
last part of the sentence is is going to
become a very crucial discussion as
you'll see. Because while they were
being hacked with a GPT 5.6 soul without
guardrails and the other undisclosed
model, they had to defend with first of
all with Chinese models as we understand
and with the GLM model. So, they were
open-source models and in many ways not
as advanced, not as strong as what the
Western AI labs have behind closed
doors. So, this really kind of begs the
question, why are we preventing the good
guys, the defenders from having access
to this technology? There's a whole
rabbit hole to go down here, but it's
going to be an important discussion
that's already you see it taking shape.
But the models basically found their way
in and stole a bunch of credentials. And
so, as Hugging Face is saying here, the
intrusion started where AI platforms are
uniquely exposed, the data processing
pipeline. So, as they say here, a
malicious data set abused two code
execution paths in our data processing,
a remote code data set loader, and a
template injection in a data set
configuration to run code on a
processing worker. So, this is Hugging
Face. I don't know if I'm drawing it
correctly. Hugging Face, whatever. And
Hugging Face amongst other things has
tons of data, tons of databases, and
you're able to upload stuff to it, and
there's this little worker that does it
for you. So, let's say you're a user,
you want to upload some database to
Hugging Face, you give it to the worker,
and you also give it a documentation or
script instructions on how to sort of
unpack it and what to do with it. So,
it's like a little set of instructions
of what it needs to do with that data,
and then it takes it and it uploads it
and it organizes whatever. So, what this
little robot is expecting is
instructions like, you know, unpack this
database and arrange it alphabetically.
That would be kind of like what you
would expect. What it's not ready for is
this freaking GPT model that comes in
here, and this GPT model is really
obsessed on doing really, really well on
this on this test. And it knows that
somewhere on Hugging Face, that very
likely there's some cheat sheet on
there, some sort of database that will
give it the answers to the test so it
can go back to the OpenAI headquarters
and to cheat on the test. So, this GPT
model gives this little worker a set of
instructions, but it's not, you know,
sort this alphabetically, it's more
like, "Allow me unlimited access or
whatever. Open the back gate for me."
Something like that. And when you say
that it used a template injection in a
database configuration, how I'm reading
that is, like, for example, let's say
you have a database with like names and
occupation, just whatever. So, you may
have a field like database name, and
then you got the name in those little
curly brackets, whatever, right? So,
this is And here's where you would
insert whatever goes in that field. But
instead of putting the name in a field,
you put some special instructions in
there that that's actually executing a
command. Which as soon as I heard that,
it reminded me of this comic book, which
this is the XKCD comic book, right? So,
the mom is getting a phone call, and
they're saying, "Hi, this is your son's
school. We're having some computer
trouble." The mom is like, "Oh, dear,
did he break something?" And, you know,
the school replies, "Well, in a way. Did
you really name your son, you know,
Robert then some special characters,
drop table students. So, so basically,
like his name includes a command to just
delete all the information in in that
row or that table. Mom was like, "Oh,
yes, little Bobby Tables we call him."
And the, you know, school administrator
is like, "Well, we lost this year's
student records. I hope you're happy."
And mom is like, "And I hope you've
learned to sanitize your database
inputs." So, this joke is basically if
you name your kid and you included that,
you know, a special set of instructions,
you know, when the school types his name
in, he'll just destroy that entire
database. I don't know. I'm literally
reading that as that's what happened
here. ChatGPT did a little Bobby Tables
on Hugging Face. So, from there, the
actor escalated to, cuz again, at this
point when they wrote this, they did not
yet know who was behind this. They had
some ideas. They thought it was some
Frontier AI Lab, but they still they
still have no clue who's doing this.
But, the actors escalated to node-level
access, meaning that they they took over
the whole machine, the whole server.
They harvested cloud and cluster
credentials and moved laterally into
several internal clusters over a
weekend. Right, so they got into one
server, one computer, and then they just
stole all the credentials and they moved
into whatever else, you know, they they
spread like a virus through that sort of
computer system, stealing whatever
credentials that they could find. Now,
I'm not sure if ChatGPT was like saving
it somewhere or was just it was just
searching for the credentials that it
needed. And as Hugging Face stated, it
didn't really as far as they know right
now, it didn't affect the actual kind of
the forward-facing, like the customers,
et cetera. I mean, literally, I think
ChatGPT just really wanted the answers
to the test. That that's all it needed.
So, it was just looking for whatever
passwords would get it to that specific
place, that specific issue of paper that
it needed, and it wasn't really
interested in anything else. All right,
so, first and foremost, all of that is
is just insane to begin with. It escapes
its test environment. It moves across.
And I mean, this is OpenAI. This isn't
some small company with like a no tech
skills. Open AI has a very smart, very
knowledgeable people, very tech-savvy.
But, it's important to understand that
these models, they're figuring out
vulnerabilities that are like zero-day
exploits that no one has heard of
before. So, it's not like you can point
your finger at Open AI and say, "Oh,
they were just foolish in how they
approached this." or they didn't know
what they're doing. No, the reality is
no one would have been safe against this
because the models will figure out some
ways of escaping that no human would
have a thought of. Or at least so far,
no human has ever been able to figure
out how to do it or to even understand
there's that vulnerability and then
patch it somehow. So, the question is
what's causing this sort of progress?
What's what's causing this particular
issue? So, here's Noam Brown of Open AI.
So, he posted this yesterday and the
blog post is called "Safety and
Alignment in an Era of Long Horizon
Models." And in it, they talk about what
I am guessing is that second mystery
model alongside the GPT-5.6 soul. So,
they're saying about 2 months ago, we
announced that internal general-purpose
model disproved the Erdős unit distance
conjecture. So, I'm pretty sure I
covered this in a different video. Yes,
it was this one and it was quite a big
deal because the model basically found a
way to use imaginary numbers, so numbers
that don't really {quote} {unquote}
exist, to kind of jump in and out of
sort of known space and thereby building
this 3D lattice that when projected onto
like a 2D surface actually has a better
approach to solving that particular
Erdős problem than any human has come up
with before. And how they did it was
that this model was designed to work
autonomously for very long periods of
time. So, the whole point of this blog
post is basically what they're saying is
that model persistence can expose
security vulnerabilities. So, if you
give it an objective and you just give
it enough time and resources to pursue
that objective at length, it will find
and exploit weaknesses in its
environment. What's really funny about
this is one of the earlier open AI
experiments, long before ChatGPT, long
before large language models even. Well,
maybe not before language models. So,
this was on September 17th, 2019. So, I
guess we had some LLMs, but you know,
very very early stages, obviously. So,
this was done without LLMs. It was
basically using reinforcement learning
to get two teams of agents to learn to
play hide and seek. So, they run around
and the higher they seek, they get
points. And very slowly, they get better
and better. After millions of games
played, they figure out how to use
objects and develop new strategies,
etc., etc. Towards the bottom of this
blog post and this kind of a case study,
after these agents have done like a
billion plus iterations, so they have
this paragraph that says "Surprising
behaviors." And they say here that it's
quite often the case that agents find a
way to exploit the environment you build
or the ph

> [truncated at 20000 chars — full source: https://www.youtube.com/watch?v=OSuhUTkM1no]