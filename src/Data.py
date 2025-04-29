from typing import TextIO

import configparser


class MineGuideConfig:
    def __init__(self, file: TextIO):
        """Loads config from a file handler that provides INI format content."""
        parser = configparser.ConfigParser(interpolation=None)
        parser.read_string(file.read())
        self._host = parser["Connection"]["host"]
        self._port = parser["Connection"]["port"]
        self._username = parser["Connection"]["username"]
        self._llm_module = parser["LLM"]["module"]
        self._llm_model_name = parser["LLM"]["model_name"]
        self._llm_client = parser["LLMClient"]

    @property
    def host(self):
        return self._host

    @property
    def port(self):
        return self._port

    @property
    def username(self):
        return self._username

    @property
    def llm_module(self):
        return self._llm_module

    @property
    def llm_model_name(self):
        return self._llm_model_name

    @property
    def llm_client(self):
        return self._llm_client
