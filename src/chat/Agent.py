from typing import Generator

from . import Prompts
from ..Data import MineGuideConfig


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
                "content": Prompts.AGENT_INIT.format(scene="颐和园"),
            }
        ]

        predefine = self._client.chat.completions.create(
            messages=self._memory,
            model=self._config.llm_model_name,
            stream=False,
        )
        self._memory.append({"role": "assistant", "content": predefine.choices[0].delta.content})

    def chat(self, username, message):
        self._memory.append(
            {
                "role": "user",
                "content": Prompts.AGENT_CHAT.format(username=username, message=message),
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
                            pop = splitted.pop(0).strip()
                            if pop:
                                yield pop
                        rst = splitted[0]
                if "</think>" in delta:
                    thinking = False

            if "\n" in rst:
                splitted = rst.split("\n")
                while len(splitted) > 1:
                    pop = splitted.pop(0).strip()
                    if pop:
                        yield pop
                rst = splitted[0]
            yield rst.strip()
            self._memory.append({"role": "assistant", "content": full.strip()})
        except Exception as arg:
            print("LLM API Error", arg)
