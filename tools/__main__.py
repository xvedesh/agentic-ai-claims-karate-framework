"""Allow `python -m tools` as a shortcut for `python -m tools.cli`."""
from tools.cli import main

if __name__ == "__main__":
    main()
