from dataclasses import dataclass
from typing import Sequence, TextIO, Union

import configparser
import json


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
        self._scene_data_file = parser["Scene"]["data_file"]
        self._scene_data = SceneConfig(open("data/" + self._scene_data_file, encoding="UTF-8"))

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

    @property
    def scene_data(self):
        return self._scene_data


@dataclass
class SceneAnchor:
    name: str
    alias: Sequence[str]
    position: Sequence[Union[int, float]]
    description: str


@dataclass
class SceneRoute:
    start: str
    end: str
    pathways: Sequence[str]


class SceneConfig:
    def __init__(self, file: TextIO):
        data = json.load(file)
        self._name = data["meta"]["name"]
        self._location = data["meta"]["location"]
        self._anchors = [SceneAnchor(**d) for d in data["anchors"]]
        self._routes = [SceneRoute(**d) for d in data["routes"]]

    @property
    def name(self):
        return self._name

    @property
    def location(self):
        return self._location

    @property
    def anchors(self):
        return self._anchors

    @property
    def routes(self):
        return self._routes
