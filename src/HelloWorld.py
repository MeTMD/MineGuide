import logging
import re
import time

from .api.BotAPI import BotAPI
from .Data import MineGuideConfig
from .chat.Agent import Agent

logger = logging.getLogger("mine_guide")

ENV_FILE = "mg.config.env"
FC_PATTERN = re.compile(r"FCFC::(\w+?)((::.+?)*?)::CFCF")


def handle_msg(agent: Agent, bot: BotAPI, username: str, message: str):
    user_pos = bot.query_player_position(username)
    self_pos = bot.query_self_position()
    if "where" in message:
        logger.debug(f"Currently at {self_pos}")
        self_pos.y -= 1
        block = bot.query_block_at(self_pos)
        bot.do_chat(f"I'm at {self_pos}. {block} under me.")
    else:
        logger.debug(f"User {username} said: {message}")
        for sentence in agent.chat(username, user_pos, self_pos, message):
            if fc_match := FC_PATTERN.match(sentence):
                try:
                    fc_name = fc_match.group(1)
                    fc_params = tuple(filter(lambda x: x, fc_match.group(2).split("::")))
                    logger.info(f"Execute FunctionCall {fc_name} {fc_params}")
                    if fc_name == "MoveTo":
                        bot.do_move_to_xyz(*map(float, fc_params))
                except Exception as arg:
                    logger.error(f"Error occurred in FunctionCall, {arg}")
            else:
                logger.debug(f"Send message: {sentence}")
                bot.do_chat(sentence)


def main():
    logger.info("Welcome to MineGuide backend")
    try:
        logger.info("Loading env config")
        config = MineGuideConfig(open("mg.config.env"))
    except FileNotFoundError:
        logger.error("Failed to load env config")
        logger.error(f"Please ensure the file '{ENV_FILE}' exists")
    except KeyError as arg:
        logger.error("Failed to load env config")
        logger.error(f"Missing config section or key {arg}")
    except Exception as arg:
        logger.error("Failed to load env config")
        logger.error(f"Cause {arg}")
    else:
        try:
            logger.info("Tuning LLM")
            agent = Agent(config)
        except Exception:
            logger.error("Failed to access LLM API")
            logger.error("Please ensure your LLM API config")
        else:
            try:
                logger.info("Starting bot")
                bot = BotAPI(config)
                bot.on_login = lambda: logger.info("Bot login succeeded")
                bot.on_receive_message = lambda x, y: handle_msg(agent, bot, x, y)
                bot.connect()
            except Exception:
                logger.error("Failed to connect to the server")
            else:
                logger.info("Press Ctrl+C to stop running")
                while True:
                    time.sleep(1)


if __name__ == "__main__":
    main()
