from .api.BotAPI import BotAPI
from .Data import MineGuideConfig
from .chat.Agent import Agent


def handle_msg(agent: Agent, bot: BotAPI, username: str, message: str):
    if "where" in message:
        pos = bot.query_self_position()
        print("Currently at", pos)
        pos.y -= 1
        block = bot.query_block_at(pos)
        print("Block under bot is", block)
        bot.do_chat(f"I'm at {pos}. {block} under me.")
    elif "come" in message:
        pos = bot.query_player_position(username)
        print("You are at", pos)
        bot.do_move_to(pos)
    else:
        print(f"{username} said {message}")
        for sentence in agent.chat(username, message):
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
