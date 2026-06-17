#!/usr/bin/env python3
# @capability: voice-pipecat-bot
# @serves: realtime voice agent | always-on rick voice loop | pipecat bot | talk to claude code by voice
# @does: the Pipecat realtime pipeline — local mic -> Silero VAD + smart-turn -> MLX Whisper STT -> brain-proxy (drives the live Claude Code tmux session) -> Marvis streaming Rick TTS -> speaker. Always-on, barge-in.
# @use: R3 of the voice rebuild. Run (venv-pipecat) alongside a tmux `claude` (bridge armed) + claude-brain-proxy.py.
# @exports: (async main)
import os, sys, asyncio
sys.path.insert(0, os.path.dirname(__file__))

from loguru import logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.audio.turn.smart_turn.local_smart_turn_v2 import LocalSmartTurnAnalyzerV2
from pipecat.services.whisper.stt import WhisperSTTServiceMLX, MLXModel
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.transports.local.audio import LocalAudioTransport, LocalAudioTransportParams
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask
from pipecat.pipeline.runner import PipelineRunner

from marvis_tts import MarvisTTSService

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
REF = os.environ.get("RICK_REF", os.path.join(REPO, "_SYSTEM", "state", "voice", "rick-ref.wav"))
PROXY = os.environ.get("BRAIN_PROXY_URL", "http://127.0.0.1:8011/v1")

# The brain proxy only consumes the latest user turn (it drives the real Claude session),
# but Pipecat needs a context/system seed.
SYSTEM = "You are the spoken voice of the user's Claude Code session. Keep replies short and conversational."


async def main():
    transport = LocalAudioTransport(LocalAudioTransportParams(
        audio_in_enabled=True,
        audio_out_enabled=True,
        vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=0.2)),
        turn_analyzer=LocalSmartTurnAnalyzerV2(smart_turn_model_path=""),
    ))
    stt = WhisperSTTServiceMLX(model=MLXModel.LARGE_V3_TURBO_Q4)
    llm = OpenAILLMService(api_key="local", model="claude-code", base_url=PROXY, max_tokens=4096)
    tts = MarvisTTSService(ref_audio=REF)

    context = LLMContext(messages=[{"role": "system", "content": SYSTEM}])
    agg = LLMContextAggregatorPair(context)

    pipeline = Pipeline([
        transport.input(),
        stt,
        agg.user(),
        llm,
        tts,
        transport.output(),
        agg.assistant(),
    ])
    task = PipelineTask(pipeline)
    logger.info("🎙  voice loop live — just talk. Ctrl-C to stop.")
    await PipelineRunner().run(task)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
