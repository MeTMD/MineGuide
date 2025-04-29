import re

from .api.BotAPI import BotAPI
from .Data import MineGuideConfig
from .chat.Agent import Agent

FC = re.compile(r"FCFC::(\w+?)((::.+?)*?)::CFCF")


def handle_msg(agent: Agent, bot: BotAPI, username: str, message: str):
    user_pos = bot.query_player_position(username)
    self_pos = bot.query_self_position()
    if "where" in message:
        print("Currently at", self_pos)
        self_pos.y -= 1
        block = bot.query_block_at(self_pos)
        bot.do_chat(f"I'm at {self_pos}. {block} under me.")
    elif "come" in message:
        print("You are at", user_pos)
        bot.do_move_to_pos(user_pos)
    else:
        print(f"{username} said {message}")
        for sentence in agent.chat(username, user_pos, self_pos, message):
            if fc_match := FC.match(sentence):
                try:
                    fc_name = fc_match.group(1)
                    fc_params = tuple(filter(lambda x: x, fc_match.group(2).split("::")))
                    print("FC", fc_name, fc_params)
                    if fc_name == "MoveTo":
                        bot.do_move_to_xyz(*map(float, fc_params))
                except Exception as arg:
                    print("Error FC", arg)
            else:
                bot.do_chat(sentence)

def main():
    print("Loading config")
    config = MineGuideConfig(open("mg.config.env"))

    print("Tuning LLM")
    agent = Agent(config)

    print("Starting bot")
    bot = BotAPI(config)
    bot.on_login = lambda: print("Bot login succeeded")
    bot.on_receive_message = lambda x, y: handle_msg(agent, bot, x, y)
    bot.connect()

    while True:
        import time

        time.sleep(1)


if __name__ == "__main__":
    main()
