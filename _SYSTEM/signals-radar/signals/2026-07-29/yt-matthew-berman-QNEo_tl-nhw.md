---
type: signal-item
channel: youtube
source: youtube/@matthew_berman
title: You NEED to do this (HUGE AI SAVINGS)
url: https://www.youtube.com/watch?v=QNEo_tl-nhw
item_id: QNEo_tl-nhw
date: 2026-07-29
signal: "new upload"
tags: [signals]
---

# You NEED to do this (HUGE AI SAVINGS)

The best people in the world at using AI
don't care as much about prompt
engineering anymore. What they do care
about is which tokens they're using for
which task. Not all tokens are made
equal. And I'm going to explain exactly
how to increase the quality of your AI
usage while also decreasing the cost.
This is what the absolute frontier of AI
users are doing and I'm going to show
you how they do it. And by the way, if
you like when I explain how to get the
most out of AI, be sure to like this
video, subscribe to the channel, it
really does help. All right, so first,
what is a token? We're going to go over
this quickly. A token is the basic unit
of a large language model like ChatGPT
or Claude. You can kind of think of them
like words. So, let me just show you.
So, this is the tokenizer that ChatGPT
uses. That means how to take text and
make them into tokens. So, here's an
example. The cow jumped over the moon.
Now, down here, each one of these colors
is the token. So, you can see there are
six total tokens, one for each word.
But, full words aren't always just a
single token. Sometimes, they're more.
Here's an example. The word programmatic
is actually two tokens, one for program
and one for matic. So, that's how to
think about tokens. And the way that
large language models work is by
predicting the next token. So, for
example, the cow jumped over the the
model hopefully would predict moon. And
now, here's the big secret. Not all
tokens are equal. Some are higher
quality, some are faster, some are more
expensive. And you want to use the right
mixture of those factors for the
specific task that you have to complete.
So, when a new model gets released, I
think a lot of people get confused
because the first thing they do is go to
the pricing page and look how much are
these tokens. And of course, OpenAI and
Anthropic have some of the most
expensive models on the planet. Here's
an example, GPT 5.6 Soul, which is the
most recent release by OpenAI and also
their most powerful model, comes in at
$5 per million input tokens and $30 per
million output tokens, which is quite
expensive. Fable from Anthropic is even
more expensive. And just last week, a
new Chinese open-source AI model dropped
called Kimi, and that came in at $3 per
million input tokens and $15 per million
output tokens, about half the price of
GPT 5.6 Soul. So, you might be thinking
to yourself, if they're scoring the same
on different benchmarks, then you're
essentially paying half the price for
the same level of intelligence. But it's
not that simple. Now, let's look at some
of those benchmarks in isolation. We see
Deep Seek, Frontier Seek, Kimi Code
Bench, Terminal Bench. These are all
very standard benchmarks that the
Frontier Labs use. And as we can see,
Kimi K3 is extremely competitive with
the best of the best models coming out
of Anthropic and OpenAI. But it comes in
at half and sometimes less than half the
price. Now, remember I said how not
every token is created equally? Well,
here's why it matters. It doesn't really
matter how much the tokens cost. What
matters is what you can actually get
done with those tokens and a fixed
price. So, let me show you a chart that
explains what I'm talking about. This is
artificial analysis, and this is the
actual cost to complete tasks on average
on their benchmark. So, what we're
seeing here is Kimi K3 costs 95 cents
per task completed, and GPT 5.6 Soul
costs a dollar and four. Basically,
about the same, very close. Now, when we
come up to Claude Fable 5, we see it's
$2.75.
Very expensive. Now, keep in mind, this
is for the same exact task. Then, if we
scroll down a little bit more, we see
something very similar. The cost to
complete the entire benchmark. We're
seeing 2,700 for Kimmy, we're seeing
2,800 for GPT 5.6, and 5,600 for Fable.
So, let's think about this math for a
second. We have GPT 5.6 coming in at $5
per million input, $30 per million
output. We have Kimmy K3 coming in at $3
per million input, $15 per million
output. And that means Kimmy is
effectively half the price. But, is it?
Because from what we've seen, it takes
twice as many tokens for Kimmy to think
through and solve a specific task than
it does GPT 5.6. And that is what I mean
by not all tokens are created equally.
So, even though it's half price, what
we're actually seeing is 2x tokens. And
because it's half price, plus takes
twice as many tokens, that is
effectively
the same price overall to accomplish a
task. So, let's say 5.6 takes 1 million
tokens to solve a task, that's $30. And
Kimmy K3 to solve that same exact task
takes 2 million tokens, that's also $30.
And this intelligence density is
extremely important. How much
intelligence are you squeezing into that
individual token? And right now, at
least from what I've seen and in my
opinion, OpenAI and ChatGPT are number
one for token density. It takes Fable
many more tokens to solve the same
problem as GPT 5.6. Now, the next thing
I want to talk about is very similar to
not all tokens being equal. It turns out
different models approach problems
differently and they behave differently.
They write code differently. They excel
at certain things and they're worse at
other things. And a really great
technique to get the highest quality
code output is letting two models
essentially review each other. And it
turns out the sponsor of this video
Greptile just released a feature that
does exactly this. Each model finds more
bugs in the other models code. So in
orange we're seeing Opus 4.7 in purple
we're seeing GPT 5.5 and when Claude in
orange authored the PR and then GPT 5.5
reviewed it, the GPT 5.5 actually found
more bugs than if Claude just reviewed
its own code. And like I said, different
models excel at different things and
they're worse at other things. So what
we're seeing here is that depending if
you're using Claude or Codex, they
cluster in different ways. So for
example, missing behavior, Claude more
guilty. Semantic intent, Codex more
guilty and so on. And by the way, if you
want to see this entire blog post and
all their findings, I'll drop a link
down below. So if you're shipping code
using AI, use Greptile to review that
code. It really is great. I really do
use it and so do teams like Nvidia,
Mentlify, Posthog, Zapier, Substack and
so many more. Ship like their teams. And
there's also another layer to think
about which is output speed. How fast
are these tokens coming to you? Because
there is a value in time. If it takes
you 30 minutes to solve a task with GPT
5.6 and it takes you an hour to solve a
task with Kimmy K3, then you are losing
time by using Kimmy K3. So that's the
first thing I want you to know. Not all
tokens are created equally. And now you
will know when a new model is released
what to look for. So this is something
that I do all the time on the hardest
task that I give AI. And this also
allows you to save a ton of money. I
will have the best possible model do the
planning. Then I will have a cheap and
fast, but also really good model write
the code, the actual execution. Then, I
will have a different frontier model,
the best of the best, do the review, the
final review. And with these three
things, I am saving money and getting
the highest quality out of it. So,
here's an example of what that might
look like. So, I'm going to use, for
example, Fable for the planning. I give
it the hardest task I have, and I say,
"Fable, come up with a full spec for
this." It reviews my code base, thinks
about how to actually build the feature
that I'm asking for or solve the problem
that I'm giving it. And the reason I
give it to the best model is because
that's the hardest part, is thinking
from a high level, "How do I actually
solve this problem?" Looking at the code
base, trying to see around corners. That
is what I give to Fable. Then, for the
executor, I'm going to give it a cheap
model. So, something like a Grok 4.5 or
the Composer model from Cursor. These
are two phenomenal, much cheaper models
that are also really good at writing
code. And it turns out you don't need
frontier models to actually write the
code. Once they have a plan, they can
write the code quite easily. And so,
you're paying a fraction of the price at
this step. Then, finally, when all of
the code is written, I'll give it to
GPT-5.6.
And so, that's another frontier model
that looks again and says, "Okay, are
there any bugs? Did they implement this
correctly against the spec that was
written by Fable?" And this is my
workflow. This is what I highly
recommend you do because the vast
majority of tokens actually happens at
the actual execution. Output tokens are
much more expensive than input tokens,
and there's a reason for that. The
planning step doesn't use nearly as many
tokens as the execution step. And for
the planning step, it's actually using a
lot more input tokens than it would
during the execution step. During the
actual code writing, the execution, it's
using a lot more output tokens, which
are much more expensive. Remember this,
$5 per million input, $30 per million
output. And then once again, during the
reviewer stage, it's using more input
tokens than it would during the actual
code writing stage. So, this is the most
expensive stage by far, and it's the one
that's technically easiest for a
non-frontier model to actually write.
So, here's an example of what this
entire flow looks like using Fable only,
GPT-5.6 only, and then what I recommend,
a mixture of models. So, for the
planning stage, we're using a million
input tokens because, of course, we have
to read the whole code base, and 100,000
output tokens because all that needs to
be output is a plan. Now, for the
executor phase, we only have to read the
plan, so far fewer tokens on the input
side, and many more tokens on the output
side because it actually has to write
all of that code. And then finally, for
the reviewer stage, once again, it's
reversed. A lot of reading and just a
little bit of output. And so, based on
this math, what we find is Fable alone
to accomplish this task is $81. GPT-5.6
coming in much less expensive, 46.50.
But, when we use the mixture, we get the
same results at a fraction of the price,
25.55.
The clear winner. This is what we want
to do. Plus, it gets the best results
also. Not only that, there's one last
benefit that I didn't even mention.
Typically, these frontier models, the
biggest, best models, tend to be slower.
And so, by using a fast, efficient,
cheap model, you are going to accomplish
the task in less overall time. Now, the
last thing I want to explain about
tokens is actually a big deal. The
future of how intelligence will be
priced is being decided right now. There
is this battle between closed source and
open source, and a race between the US
and China. But mainly, I want to talk
about open source versus closed source.
Right now, the biggest, best models on
the planet are all coming from basically
one of two AI labs in the United States.
It's either OpenAI, or it's Anthropic.
But they have the most expensive
intelligence because each one of their
tokens is the highest priced. Well, why
does that actually matter? It turns out,
these closed source frontier labs are
making a ton of money on these tokens
that they're selling. And that's their
business model. They want to sell
tokens, and they want to have huge
margins on those tokens. And they're
doing it. They're doing it quite well.
But open source has really come into the
conversation, especially in the last few
weeks, as being a very competitive
alternative to these frontier models. As
I showed you, Kimmy is very very good.
It does use twice as many tokens, but
since everybody in the world can
actually go and look at the Kimmy model,
can actually download it, run it
themselves, they can optimize it for
their own use cases. They will figure
out more ways to drive down the price of
inference. All of the hyperscalers are
going to be battling to give the lowest
price possible on those Kimmy tokens,
because they can all use it, and they
can all serve it. And that benefits us,
the actual consumers of those tokens.
They're battling for the lowest price,
we win. Now, on the other hand, the
closed-source frontier models don't have
as much incentive to bring their prices
down. They're sitting there thinking,
"Well, we have the best models on the
planet. Only we and our partners can
serve it, so take it or leave it." Now,
of course, it's not quite like that.
There is a duopoly currently between
Anthropic and OpenAI, and they have to
compete with each other. And we've seen
the benefit of that simply by how many
times the Codex team has reset the quota
over the last few weeks in competition
with Anthropic. Now, when open-source
wins, the margins on the tokens drop
substantially because everybody can
serve it. All of the hyperscalers,
anybody with a data center can serve
these open-source models. And so,
they're incentivized. They have
competition, and so they need to drop
their prices as much as possible. And
so, what happens then is the profit in
artificial intelligence goes away from
serving tokens and goes into every other
part of the AI stack. It goes to Nvidia
and other chip providers because as the
price of a token decreases, people use
more tokens. More tokens means more
chips. It goes to the hyperscalers and
other data centers because as people use
more tokens, they need to be able to
serve those tokens. And so, they're
serving a lot more tokens, and thus
they're making more revenue. It even
goes to the application level. If you're
building software on top of artificial
intelligence or using AI to build
software, you're paying less, your
software is getting better because
you're using more tokens, and overall,
it's just good for the application layer
as well. And so, that's the battle
happening right now. If the
closed-source frontier labs win, then
you most likely will continue to get the
best tokens, but you're also going to be
paying a premium for them. If open
source wins, you will be paying less
money per token. The closed source model
providers like OpenAI and Anthropic will
probably have a competitive
disadvantage, and they will have to
compete in other areas other than
margins on the tokens they're selling.
Now, I know this is a lot. I could
probably make an entire video about the
economics of tokens or tokenomics, but
that's a little primer for you. Just
know this stuff is happening right now.
And if you want to stay up-to-date on
the latest in AI, check out our
newsletter Open source is so important.
That's why I made an entire video about
it, which you could check out right
here.