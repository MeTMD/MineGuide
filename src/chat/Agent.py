from typing import Generator

import logging

from . import Prompts
from ..api.ClassesAPI import Vector3
from ..Data import MineGuideConfig

logger = logging.getLogger("mine_guide")


def import_openai_class(config: MineGuideConfig):
    import importlib

    llm_module = importlib.import_module(config.llm_module)
    for m_name in sorted(dir(llm_module), key=len):
        m = getattr(llm_module, m_name)
        if isinstance(m, type) and "OpenAI" in m_name:
            return m
    raise ImportError("Cannot dynamically import OpenAI class type")


class Agent:
    def __init__(self, config: MineGuideConfig):
        OpenAI = import_openai_class(config)
        self._config = config
        self._client = OpenAI(**config.llm_client)
        self._memory = [
            {
                "role": "user",
                "content": Prompts.AGENT_INIT.format(
                    scene=config.scene_data.name,
                    location=config.scene_data.location,
                    anchors=[
                        Prompts.AGENT_INIT_ANCHOR.format(
                            name=d.name, alias=d.alias, position=d.position, description=d.description
                        )
                        for d in config.scene_data.anchors
                    ],
                ),
            }
        ]

        predefine = self._client.chat.completions.create(
            messages=self._memory,
            model=self._config.llm_model_name,
            stream=False,
        )
        self._memory.append({"role": "assistant", "content": predefine.choices[0].delta.content})

    def chat(self, username: str, user_position: Vector3, self_position: Vector3, message: str):
        def purify(text: str):
            return text.strip().replace("<think>", "").replace("</think>", "")

        self._memory.append(
            {
                "role": "user",
                "content": Prompts.AGENT_CHAT.format(
                    username=username, user_position=user_position, self_position=self_position, message=message
                ),
            }
        )
        stream: Generator = self._client.chat.completions.create(
            messages=self._memory,
            model=self._config.llm_model_name,
            stream=True,
        )

        rst = ""
        full = ""
        thinking = False
        try:
            logger.debug("Fetching LLM response")
            for chunk in stream:
                delta: str = chunk.choices[0].delta.content
                # print(delta or "", end="")
                if "<think>" in delta:
                    thinking = True
                if not thinking:
                    rst += delta
                    full += delta
                    if "\n" in rst:
                        splitted = rst.split("\n")
                        while len(splitted) > 1:
                            if pop := purify(splitted.pop(0)):
                                yield pop
                        rst = splitted[0]
                if "</think>" in delta:
                    thinking = False

            if "\n" in rst:
                splitted = rst.split("\n")
                while len(splitted) > 1:
                    if pop := purify(splitted.pop(0)):
                        yield pop
                rst = splitted[0]
            yield purify(rst)
        except Exception as arg:
            logger.error(f"LLM API Error {arg}")
        finally:
            self._memory.append({"role": "assistant", "content": full.strip()})
