import csv
from exception_handling import *

def load_generations(filename):
    generations = {}
    with open(filename, mode='r') as file:
        reader = csv.reader(file)
        for row in reader:
            generation_num = row[0]
            games = [game for game in row[1:] if game]  
            generations[generation_num] = games
    return generations

def get_valid_game(generation_games):
    lower_games = [game.lower() for game in generation_games]
    
    while True:
        game = input("Enter the game you are playing: ").strip().lower()  
        print()
        if game in lower_games:
            print(f"You have selected: {generation_games[lower_games.index(game)]}")  
            print()
            return generation_games[lower_games.index(game)]
        else:
            print("Invalid game! Please enter a valid game name from your chosen generation.")

def select_generation():
    generations = load_generations('generations.csv')
    
    while True:
        print()
        chosen_gen = input("Enter the generation number you're playing (1-9): ").strip()
        print()
        if chosen_gen in generations:
            print(f"You have chosen Generation {chosen_gen}: {', '.join(generations[chosen_gen])}")
            print()
            return chosen_gen, generations[chosen_gen]  
        else:
            print("Invalid input! Please enter a number between 1 and 9.")

def load_gyms(game):
    gyms = []
    with open('gym_leaders.csv', mode='r') as file:
        reader = csv.DictReader(file, delimiter=';')
        for row in reader:
            if row['Game'].strip().lower() == game.strip().lower():
                gym_name = row['Gym name'].strip()
                if gym_name not in gyms:
                    gyms.append(gym_name)
    return gyms

def display_gyms_in_game(game):
    gyms = load_gyms(game)

    print(f"Gyms available in {game}:")
    for gym in gyms:
        print(gym)
    print()

def get_valid_gym(gyms):
    lower_gyms = [gym.lower() for gym in gyms]
    
    while True:
        gym = input("Enter the gym you want to choose: ").strip().lower()
        print()
        if gym in lower_gyms:
            chosen_gym = gyms[lower_gyms.index(gym)]
            print(f"You have selected: {chosen_gym}")
            print()
            return chosen_gym
        else:
            print("Invalid gym! Please enter a valid gym name from the list.")

def display_gyms_in_game(game):
    gyms = load_gyms(game)

    print(f"Gyms available in {game}:")
    for gym in gyms:
        print(gym)
    print()

    chosen_gym = get_valid_gym(gyms)
    return chosen_gym

def load_gym_leaders_by_gym(gym_name):
    gym_leaders = []
    with open('gym_leaders.csv', mode='r') as file:
        reader = csv.DictReader(file, delimiter=';')  
        for row in reader:
            if row['Gym name'].strip().lower() == gym_name.strip().lower():
                gym_leaders.append(row)
    return gym_leaders

def load_pokedex():
    pokedex = {}
    with open('pokedex.csv', mode='r') as file:
        reader = csv.DictReader(file)
        for row in reader:
            pokedex[row['Name']] = row
    return pokedex

def display_gym_leaders(gym_name, game):
    gym_leaders = load_gym_leaders_by_gym(gym_name)
    pokedex = load_pokedex()  
    
    current_leader = None
    pokemon_count = 0 
    starter = None

    if gym_name == "Pokemon League":
        if game in ['Red', 'Green', 'Blue']:
            starter = get_valid_starter(['Bulbasaur', 'Charmander', 'Squirtle'])
        elif game == 'Yellow':
            eevee = get_valid_eevee()
        elif game in ['FireRed', 'LeafGreen']:
            starter = get_valid_starter(['Bulbasaur', 'Charmander', 'Squirtle'])
            is_first_time = handle_first_time(gym_name)
        elif game in ['Platinum', 'HeartGold', 'SoulSilver', 'Black', 'White', 'Black 2', 'White 2', 'Omega Ruby', 'Alpha Sapphire']:
            is_first_time = handle_first_time(gym_name)

    if gym_name != "Pokemon League":
        if game == 'Emerald':
            visits = get_valid_visits(-1, gym_name)

    if gym_name == "Striaton Gym" and game in ['Black', 'White']:
        starter = get_valid_starter(['Snivy', 'Tepig', 'Oshawott'])

    if game in ['Black 2', 'White 2']:
        valid_modes = ["easy", "normal", "challenge"]
        while True:
            game_mode = input("Choose your game mode (easy, normal, challenge): ").strip().lower()
            if game_mode in valid_modes:
                break
            print("Invalid mode! Please choose 'easy', 'normal', or 'challenge'.")

    if game in ['Sun', 'Moon']:
        if gym_name in ['Malie City']:
            is_first_time = handle_first_time(gym_name)
        elif gym_name == "Hau'oli City":
            starter = get_valid_starter(['Rowlet', 'Litten', 'Popplio'])
        elif gym_name == 'Pokemon League':
            is_first_time = handle_first_time(gym_name)
            if is_first_time:
                starter = get_valid_starter(['Rowlet', 'Litten', 'Popplio'])

    if game in ['Ultra Sun', 'Ultra Moon']:
        if gym_name == "Hau'oli City":
            starter = get_valid_starter(['Rowlet', 'Litten', 'Popplio'])
        elif gym_name in ['Iki Town', 'Brooklet Hill']:
            is_first_time = handle_first_time(gym_name)
        elif gym_name == 'Pokemon League':
            is_first_time = handle_first_time(gym_name)
            if is_first_time:
                starter = get_valid_starter(['Rowlet', 'Litten', 'Popplio'])
    
    if game in ['Sword', 'Shield']:
        if gym_name == "Ballonlea Stadium":
            is_first_time = handle_first_time(gym_name)
        elif gym_name == "Spikemuth":
            visits = get_valid_visits(2, "Spikemuth")
        elif gym_name == "Champion Cup":
            starter = get_valid_starter(['Grookey', 'Scorbunny', 'Sobble'])
    
    if game in ['Brilliant Diamond', 'Shining Pearl']:
        if gym_name != 'Pokemon League':
            is_first_time = handle_first_time(gym_name)
        else:
            visits = get_valid_visits(2, "Pokemon League")
    
    if game in ['Scarlet', 'Violet']:
        if gym_name != 'Pokemon League':
            is_first_time = handle_first_time(gym_name)

    for leader in gym_leaders:
        if leader['Game'].strip() != game:
            continue
        
        if game in ['Red', 'Green', 'Blue'] and leader['Gym leader'].split(" (")[0] == "Blue" and starter not in leader['Gym leader']:
            continue
        elif game == 'Yellow' and leader['Gym leader'].split(" (")[0] == "Blue" and eevee not in leader['Gym leader']:
            continue
        elif game == 'Emerald' and gym_name != "Pokemon League":
            if visits == 0 and "rematch" in leader['Gym leader']:
                continue
            elif visits < 4 and not leader['Gym leader'].endswith(f" (rematch {visits})"):
                continue
            elif visits >= 4 and not leader['Gym leader'].endswith(" (rematch 4+)"):
                continue
        elif game in ['FireRed', 'LeafGreen']:
            if is_first_time:
                if leader['Gym leader'].endswith(" (rematch)"):
                    continue
                if leader['Gym leader'].split(" (")[0] == "Blue" and starter not in leader['Gym leader']:
                    continue
            else:
                if not leader['Gym leader'].endswith(" (rematch)"):
                    continue
                if leader['Gym leader'].split(" (")[0] == "Blue" and starter not in leader['Gym leader']:
                    continue 
        elif game in ['Platinum', 'HeartGold', 'SoulSilver', 'Black', 'White','Omega Ruby', 'Alpha Sapphire'] and gym_name == 'Pokemon League':
            if is_first_time and leader['Gym leader'].endswith(" (rematch)"):
                continue
            if not is_first_time and not leader['Gym leader'].endswith(" (rematch)"):
                continue
        elif game in ['Black', 'White'] and gym_name == 'Striaton Gym' and not leader['Gym leader'].endswith(f" (starter: {starter})"):
            continue
        elif game in ['Black 2', 'White 2']:
            if game_mode not in leader['Gym leader']:
                continue
            if gym_name == 'Pokemon League' and is_first_time and leader['Gym leader'].endswith(" (rematch)"):
                continue
            elif gym_name == 'Pokemon League' and not is_first_time and not leader['Gym leader'].endswith(" (rematch)"):
                continue
        elif game in ['Sun', 'Moon']:
            if gym_name == "Hau'oli City" and starter not in leader['Gym leader']:
                continue
            if gym_name == 'Malie City':
                if not is_first_time and not leader['Gym leader'].endswith(" (rematch)"):
                    continue
                elif is_first_time and leader['Gym leader'].endswith(" (rematch)"):
                    continue
            if gym_name == "Pokemon League":
                if is_first_time:
                    if leader['Gym leader'].endswith(" (rematch)"):
                        continue
                    if leader['Gym leader'].split(" (")[0] == "Kukui" and starter not in leader['Gym leader']:
                        continue
                else:
                    if not leader['Gym leader'].endswith(" (rematch)"):
                        continue
        elif game in ['Ultra Sun', 'Ultra Moon']:
            if gym_name == "Hau'oli City" and starter not in leader['Gym leader']:
                continue
            elif gym_name in ['Iki Town', 'Brooklet Hill']:
                if is_first_time and leader['Gym leader'].endswith(" (rematch)"):
                    continue
                elif not is_first_time and not leader['Gym leader'].endswith(" (rematch)"):
                    continue
            elif gym_name == 'Pokemon League':
                if is_first_time:
                    if leader['Gym leader'].endswith(" (rematch)"):
                        continue
                    if leader['Gym leader'].split(" (")[0] == "Hau" and starter not in leader['Gym leader']:
                        continue
                elif not is_first_time and not leader['Gym leader'].endswith(" (rematch)"):
                    continue
        elif game in ['Sword', 'Shield']:
            if gym_name == "Ballonlea Stadium":
                if is_first_time and leader['Gym leader'].endswith(" (rematch)"):
                    continue
                elif not is_first_time and not leader['Gym leader'].endswith(" (rematch)"):
                    continue
            elif gym_name == "Spikemuth":
                if visits == 0 and "rematch" in leader['Gym leader']:
                    continue
                if visits == 1 and not leader['Gym leader'].endswith(" (rematch 1)"):
                    continue
                if visits == 2 and not leader['Gym leader'].endswith(" (rematch 2)"):
                    continue
            elif gym_name == "Champion Cup":
                if leader['Gym leader'].split(" (")[0] == "Hop" or leader['Gym leader'].split(" (")[0] == "Leon" and starter not in leader['Gym leader']:
                    continue
        elif game in ['Brilliant Diamond', 'Shining Pearl']:
            if gym_name != 'Pokemon League':
                if is_first_time and leader['Gym leader'].endswith(" (rematch)"):
                    continue
                elif not is_first_time and not leader['Gym leader'].endswith(" (rematch)"):
                    continue
            else:
                if visits == 0 and "rematch" in leader['Gym leader']:
                    continue
                if visits == 1 and not leader['Gym leader'].endswith(" (rematch 1)"):
                    continue
                if visits == 2 and not leader['Gym leader'].endswith(" (rematch 2)"):
                    continue
        elif game in ['Scarlet', 'Violet']:
            if gym_name != 'Pokemon League':
                if is_first_time and leader['Gym leader'].endswith(" (rematch)"):
                    continue
                elif not is_first_time and not leader['Gym leader'].endswith(" (rematch)"):
                    continue

        if leader['Gym leader'] != current_leader:                
            if current_leader is not None:
                print()  
            current_leader = leader['Gym leader']
            print(f"-- {current_leader.split(" (")[0]} --")
        
        pokemon_gender = '♂' if leader['Gender'].strip().lower() == 'male' else '♀' if leader['Gender'].strip().lower() == 'female' else ''
        
        pokemon_count += 1  
        print(f"{pokemon_count}. {leader['Pokémon']} {pokemon_gender}")  
        
        if leader['Level']:
            print(f"- Lvl. {leader['Level']}")
        
        pokemon_data = pokedex.get(leader['Pokémon'], {})
        
        types = [pokemon_data['Type1']]
        if pokemon_data['Type2']:
            types.append(pokemon_data['Type2'])
        print(f"- Type: {', '.join(types)}")

        print(f"- First ability: {pokemon_data['ability_0']}")
        if pokemon_data['ability_1']:
            print(f"- Second ability: {pokemon_data['ability_1']}")
        if pokemon_data['ability_H']:
            print(f"- Hidden ability: {pokemon_data['ability_H']}")
        
        if leader['Held Item']:
            print(f"- Held item: {leader['Held Item']}")
        if leader['Dynamax']:
            print(f"- Dynamax state: {leader['Dynamax']}")

def main():
    chosen_gen, generation_games = select_generation()
    chosen_game = get_valid_game(generation_games)
    chosen_gym = display_gyms_in_game(chosen_game)
    
    display_gym_leaders(chosen_gym, chosen_game)  

main()
