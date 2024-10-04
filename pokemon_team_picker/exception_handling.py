# List of gyms with rematches as tuples (gym_name, game)
REMATCH_GYMS = [
    ('Rustboro Gym', 'Emerald'),
    ('Emerald Gym 2', 'Emerald'),
    ('Black 2 Gym', 'Black 2'),
    ('White 2 Gym', 'White 2'),
    ('Sun Gym', 'Sun'),
    ('Moon Gym', 'Moon'),
    # Add other gyms with rematches here
]

def get_valid_starter(choices):
    while True:
        starter = input(f"Choose your starter ({', '.join(choices)}): ").strip().title()
        if starter in choices:
            return starter
        print("Invalid Pokémon! Please try again.")

def get_valid_eevee():
    while True:
        eevee = input("What did Eevee evolve into ('Vaporeon', 'Jolteon', 'Flareon')? ").strip().title()
        if eevee in ['Vaporeon', 'Jolteon', 'Flareon']:
            return eevee
        print("Invalid Pokémon! Please try again.")

def get_valid_visits(max_visits, gym_name):
    while True:
        try:
            visits = int(input(f"How many times have you fought in {gym_name.title()}? "))
            if visits < 0:
                print("Please enter a number that is 0 or greater.")
            elif visits > max_visits and max_visits != -1:
                print(f"Please enter a number lower than {max_visits}.")
            else:
                return visits
        except ValueError:
            print("Invalid input! Please enter a number.")

def handle_first_time(gym_name):
    while True:
        first_time = input(f"Is it your first time fighting {gym_name}? (yes/no): ").strip().lower()
        if first_time == 'yes':
            return True
        elif first_time == 'no':
            return False
        else:
            print("Invalid input! Please enter 'yes' or 'no'.")
