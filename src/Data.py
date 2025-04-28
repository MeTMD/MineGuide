from typing import TextIO

import configparser


class MineGuideConfig:
    def __init__(self, file: TextIO):
        """Loads config from a file handler that provides INI format content.
        """
        parser = configparser.ConfigParser()
        parser.read_string(file.read())
        self._host = parser["Connection"]["host"]
        self._port = parser["Connection"]["port"]
        self._username = parser["Connection"]["username"]

    @property
    def host(self):
        return self._host

    @property
    def port(self):
        return self._port

    @property
    def username(self):
        return self._username
