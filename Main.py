import logging

logger = logging.getLogger("mine_guide")
console_handler = logging.StreamHandler()
console_handler.setFormatter(logging.Formatter("[%(levelname).1s] %(module)s - %(message)s"))
logger.addHandler(console_handler)
logger.setLevel(logging.DEBUG)
logger.propagate = False

from src import Core

Core.main()
