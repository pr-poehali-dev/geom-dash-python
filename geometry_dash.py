"""
Geometry Dash — Python/Pygame версия
Управление: ПРОБЕЛ или стрелка ВВЕРХ — прыжок
Установка: pip install pygame
Запуск:    python geometry_dash.py
"""

import pygame
import sys
import random
import math

# ─── Константы ───────────────────────────────────────────────
SCREEN_W, SCREEN_H = 900, 500
FPS = 60
GROUND_Y = 400
PLAYER_X = 150
PLAYER_SIZE = 40
GRAVITY = 0.55
JUMP_FORCE = -12.5
ROTATION_SPEED = 4  # градусов за кадр в воздухе

# Цвета
C_BG_TOP    = (8,   0,  26)
C_BG_BOT    = (26,  0,  85)
C_GROUND_T  = (24,  0,  80)
C_GROUND_B  = (8,   0,  32)
C_GLOW_BLUE = (68, 170, 255)
C_PINK      = (255, 68, 204)
C_WHITE     = (255, 255, 255)
C_STAR      = (200, 210, 255)

# ─── Уровни ──────────────────────────────────────────────────
LEVELS = [
    {
        "name": "STEREO MADNESS",
        "speed": 4,
        "min_gap": 260, "max_gap": 340,
        "bg_top":    (8,   0,  26),
        "bg_bot":    (26,  0,  85),
        "gnd_top":   (24,  0,  80),
        "gnd_bot":   (8,   0,  32),
        "glow":      (68, 170, 255),
        "obs_top":   (187,  0, 119),
        "obs_bot":   (255,  85, 221),
        "cube_top":  (34, 170, 255),
        "cube_bot":  (0,   68, 204),
    },
    {
        "name": "BASE AFTER BASE",
        "speed": 5,
        "min_gap": 210, "max_gap": 290,
        "bg_top":    (0,  21,  16),
        "bg_bot":    (0,  68,  51),
        "gnd_top":   (0,  34,   0),
        "gnd_bot":   (0,  17,   0),
        "glow":      (0, 255, 136),
        "obs_top":   (0, 119,  68),
        "obs_bot":   (0, 255, 170),
        "cube_top":  (0, 255, 153),
        "cube_bot":  (0, 119,  68),
    },
    {
        "name": "CANT LET GO",
        "speed": 6,
        "min_gap": 170, "max_gap": 250,
        "bg_top":    (26,   8,   0),
        "bg_bot":    (74,  21,   0),
        "gnd_top":   (51,   8,   0),
        "gnd_bot":   (26,   2,   0),
        "glow":      (255, 102,   0),
        "obs_top":   (204,  51,   0),
        "obs_bot":   (255, 119,  51),
        "cube_top":  (255, 136,  51),
        "cube_bot":  (204,  51,   0),
    },
]

# ─── Генерация уровня ─────────────────────────────────────────
def generate_obstacles(level):
    obstacles = []
    x = 700
    types = ["spike", "block", "double_spike"]
    for _ in range(200):
        t = random.choice(types)
        if t == "spike":
            obstacles.append({"x": x, "type": "spike", "w": 40, "h": 40})
        elif t == "double_spike":
            obstacles.append({"x": x, "type": "double_spike", "w": 80, "h": 40})
        else:
            obstacles.append({"x": x, "type": "block", "w": 40, "h": int(55 + random.random() * 20)})
        x += level["min_gap"] + int(random.random() * (level["max_gap"] - level["min_gap"]))
    return obstacles

# ─── Звук через pygame.sndarray ──────────────────────────────
def make_tone(freq, duration, volume=0.3, wave="square", sample_rate=44100):
    import numpy as np
    n = int(sample_rate * duration)
    t = np.linspace(0, duration, n, endpoint=False)
    if wave == "square":
        data = np.sign(np.sin(2 * math.pi * freq * t))
    elif wave == "sawtooth":
        data = 2 * (t * freq - np.floor(0.5 + t * freq))
    elif wave == "triangle":
        data = 2 * np.abs(2 * (t * freq - np.floor(t * freq + 0.5))) - 1
    else:
        data = np.sin(2 * math.pi * freq * t)
    data = (data * volume * 32767).astype(np.int16)
    stereo = np.column_stack([data, data])
    return pygame.sndarray.make_sound(stereo)

def try_make_sounds():
    """Создаёт звуки если numpy доступен, иначе возвращает None"""
    try:
        import numpy as np  # noqa
        jump_snd = make_tone(660, 0.12, 0.2, "square")
        death_snd = make_tone(150, 0.3, 0.25, "sawtooth")
        return jump_snd, death_snd
    except ImportError:
        return None, None

# ─── Рисование с градиентом (вертикальный) ───────────────────
def draw_rect_gradient(surf, top_color, bot_color, rect):
    x, y, w, h = rect
    for i in range(h):
        r = top_color[0] + (bot_color[0] - top_color[0]) * i // h
        g = top_color[1] + (bot_color[1] - top_color[1]) * i // h
        b = top_color[2] + (bot_color[2] - top_color[2]) * i // h
        pygame.draw.line(surf, (r, g, b), (x, y + i), (x + w, y + i))

def draw_glow_line(surf, color, start, end, width=2, glow_radius=8):
    for r in range(glow_radius, 0, -2):
        alpha = int(80 * (1 - r / glow_radius))
        glow_surf = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
        a = max(0, min(255, alpha))
        pygame.draw.line(glow_surf, (*color, a), start, end, r * 2)
        surf.blit(glow_surf, (0, 0))
    pygame.draw.line(surf, color, start, end, width)

def draw_cube(surf, x, y, angle, level):
    size = PLAYER_SIZE
    cube_surf = pygame.Surface((size + 20, size + 20), pygame.SRCALPHA)
    cx, cy = (size + 20) // 2, (size + 20) // 2

    # Градиент (имитация: два треугольника)
    top_c = level["cube_top"]
    bot_c = level["cube_bot"]
    glow_c = level["glow"]

    # Glow
    for r in range(14, 0, -3):
        a = int(120 * (1 - r / 14))
        pygame.draw.rect(cube_surf, (*glow_c, a),
                         (cx - size // 2 - r, cy - size // 2 - r, size + r * 2, size + r * 2), border_radius=6)

    # Основной куб
    pygame.draw.rect(cube_surf, bot_c,
                     (cx - size // 2, cy - size // 2, size, size), border_radius=7)
    pygame.draw.polygon(cube_surf, top_c, [
        (cx - size // 2, cy - size // 2),
        (cx + size // 2, cy - size // 2),
        (cx + size // 2, cy + size // 2),
    ])

    # Обводка
    pygame.draw.rect(cube_surf, glow_c,
                     (cx - size // 2, cy - size // 2, size, size), 2, border_radius=7)

    # Ромб внутри
    diamond = [(cx, cy - 11), (cx + 11, cy), (cx, cy + 11), (cx - 11, cy)]
    pygame.draw.polygon(cube_surf, (255, 255, 255, 80), diamond)

    # Блик
    shine = [(cx - 14, cy - 14), (cx + 2, cy - 14), (cx - 14, cy + 2)]
    pygame.draw.polygon(cube_surf, (255, 255, 255, 55), shine)

    rotated = pygame.transform.rotate(cube_surf, -angle)
    rect = rotated.get_rect(center=(x + size // 2, y + size // 2))
    surf.blit(rotated, rect.topleft)

def draw_spike(surf, x, level, count=1):
    glow_c = level["glow"]
    top_c = level["obs_bot"]
    bot_c = level["obs_top"]
    for i in range(count):
        sx = x + i * 40
        # Glow
        glow_s = pygame.Surface((50, 50), pygame.SRCALPHA)
        pygame.draw.polygon(glow_s, (*top_c, 60),
                            [(5, 48), (25, 5), (45, 48)])
        surf.blit(glow_s, (sx - 5, GROUND_Y - 45))
        # Шип
        pygame.draw.polygon(surf, bot_c, [(sx, GROUND_Y), (sx + 20, GROUND_Y - 40), (sx + 40, GROUND_Y)])
        pygame.draw.polygon(surf, top_c, [(sx, GROUND_Y), (sx + 20, GROUND_Y - 40), (sx + 40, GROUND_Y)], 2)
        _ = glow_c  # используется в glow выше

def draw_block(surf, x, h, level):
    glow_c = level["obs_bot"]
    top_c = level["obs_top"]
    bot_c = (top_c[0] // 2, top_c[1] // 2, top_c[2] // 2)
    rect = (x, GROUND_Y - h, 40, h)
    draw_rect_gradient(surf, top_c, bot_c, rect)
    pygame.draw.rect(surf, glow_c, rect, 2, border_radius=4)
    # Линии-делители
    for j in range(1, 3):
        y_line = GROUND_Y - h + j * (h // 3)
        pygame.draw.line(surf, (*glow_c, 50), (x, y_line), (x + 40, y_line))

# ─── Частицы ─────────────────────────────────────────────────
class Particle:
    def __init__(self, x, y, color):
        self.x = x
        self.y = y
        self.vx = random.uniform(-6, 6)
        self.vy = random.uniform(-6, 2)
        self.life = 1.0
        self.color = color
        self.size = random.randint(3, 7)

    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.vy += 0.3
        self.life -= 0.028

    def draw(self, surf):
        if self.life <= 0:
            return
        a = max(0, min(255, int(self.life * 255)))
        s = pygame.Surface((self.size * 2, self.size * 2), pygame.SRCALPHA)
        pygame.draw.rect(s, (*self.color, a), (0, 0, self.size * 2, self.size * 2))
        surf.blit(s, (int(self.x - self.size), int(self.y - self.size)))

# ─── Главный класс игры ──────────────────────────────────────
class Game:
    def __init__(self):
        pygame.init()
        pygame.mixer.pre_init(44100, -16, 2, 512)
        pygame.mixer.init()
        self.screen = pygame.display.set_mode((SCREEN_W, SCREEN_H))
        pygame.display.set_caption("Geometry Dash")
        self.clock = pygame.time.Clock()

        # Шрифты
        self.font_big   = pygame.font.SysFont("Arial", 48, bold=True)
        self.font_med   = pygame.font.SysFont("Arial", 28, bold=True)
        self.font_small = pygame.font.SysFont("Arial", 18)

        # Звуки
        self.jump_snd, self.death_snd = try_make_sounds()

        self.state = "menu"
        self.level_idx = 0
        self.best_scores = [0, 0, 0]
        self.stars = [(random.randint(0, SCREEN_W), random.randint(0, GROUND_Y - 30),
                       random.randint(1, 2), random.random() * math.pi * 2)
                      for _ in range(70)]
        self.reset_game()

    def reset_game(self):
        self.player_y = float(GROUND_Y - PLAYER_SIZE)
        self.player_vy = 0.0
        self.on_ground = True
        self.alive = True
        self.score = 0
        self.bg_offset = 0.0
        self.rotation = 0.0
        self.obstacles = generate_obstacles(LEVELS[self.level_idx])
        self.particles = []

    def jump(self):
        if self.on_ground:
            self.player_vy = JUMP_FORCE
            self.on_ground = False
            if self.jump_snd:
                self.jump_snd.play()

    def die(self):
        self.alive = False
        lvl = LEVELS[self.level_idx]
        colors = [lvl["glow"], lvl["obs_bot"], (255, 255, 255), (255, 255, 68)]
        for _ in range(22):
            self.particles.append(Particle(
                PLAYER_X + PLAYER_SIZE // 2,
                int(self.player_y) + PLAYER_SIZE // 2,
                random.choice(colors)
            ))
        if self.score > self.best_scores[self.level_idx]:
            self.best_scores[self.level_idx] = self.score
        if self.death_snd:
            self.death_snd.play()
        self.state = "dead"

    def update(self):
        lvl = LEVELS[self.level_idx]
        if self.state != "playing" or not self.alive:
            for p in self.particles:
                p.update()
            self.particles = [p for p in self.particles if p.life > 0]
            return

        # Физика
        self.player_vy += GRAVITY
        self.player_y += self.player_vy
        self.bg_offset += lvl["speed"]

        if not self.on_ground:
            self.rotation += ROTATION_SPEED

        if self.player_y >= GROUND_Y - PLAYER_SIZE:
            self.player_y = float(GROUND_Y - PLAYER_SIZE)
            self.player_vy = 0.0
            self.on_ground = True
        else:
            self.on_ground = False

        self.score = int(self.bg_offset // 100)

        # Коллизии
        px = PLAYER_X
        py = int(self.player_y)
        for obs in self.obstacles:
            sx = int(obs["x"] - self.bg_offset)
            if sx + obs["w"] < 0:
                continue
            if sx > SCREEN_W:
                break

            hit = False
            if obs["type"] in ("spike", "double_spike"):
                count = 2 if obs["type"] == "double_spike" else 1
                for i in range(count):
                    tx = sx + i * 40
                    if (px + PLAYER_SIZE - 5 > tx + 4 and
                            px + 5 < tx + 36 and
                            py + PLAYER_SIZE > GROUND_Y - 38 and
                            py + PLAYER_SIZE <= GROUND_Y + 2):
                        rel_x = abs((px + PLAYER_SIZE // 2) - (tx + 20))
                        t_h = 38 - rel_x * 1.9
                        if t_h > 0 and py + PLAYER_SIZE > GROUND_Y - t_h + 4:
                            hit = True
            else:
                if (px + PLAYER_SIZE - 5 > sx + 4 and
                        px + 5 < sx + 36 and
                        py + PLAYER_SIZE > GROUND_Y - obs["h"] + 4 and
                        py < GROUND_Y):
                    hit = True

            if hit:
                self.die()
                return

        # Частицы
        for p in self.particles:
            p.update()
        self.particles = [p for p in self.particles if p.life > 0]

    def draw_background(self):
        lvl = LEVELS[self.level_idx]
        draw_rect_gradient(self.screen, lvl["bg_top"], lvl["bg_bot"], (0, 0, SCREEN_W, GROUND_Y))
        # Нижняя часть
        draw_rect_gradient(self.screen, lvl["gnd_top"], lvl["gnd_bot"],
                           (0, GROUND_Y, SCREEN_W, SCREEN_H - GROUND_Y))

        # Звёзды
        t = pygame.time.get_ticks() / 1000
        for i, (sx_base, sy, sz, phase) in enumerate(self.stars):
            sx = int((sx_base - self.bg_offset * 0.07) % SCREEN_W)
            alpha = int(180 + 60 * math.sin(t * 2 + phase))
            s = pygame.Surface((sz * 2, sz * 2), pygame.SRCALPHA)
            pygame.draw.rect(s, (*C_STAR, alpha), (0, 0, sz * 2, sz * 2))
            self.screen.blit(s, (sx, sy))

        # Сетка
        grid_size = 60
        grid_off = int(self.bg_offset) % grid_size
        grid_color = (*lvl["glow"], 28)
        grid_surf = pygame.Surface((SCREEN_W, GROUND_Y), pygame.SRCALPHA)
        for x in range(-grid_off, SCREEN_W, grid_size):
            pygame.draw.line(grid_surf, grid_color, (x, 0), (x, GROUND_Y))
        for y in range(0, GROUND_Y, grid_size):
            pygame.draw.line(grid_surf, grid_color, (0, y), (SCREEN_W, y))
        self.screen.blit(grid_surf, (0, 0))

        # Линия земли с glow
        draw_glow_line(self.screen, lvl["glow"], (0, GROUND_Y), (SCREEN_W, GROUND_Y), 2, 10)

        # Тайлы земли
        tile_w = 60
        tile_off = int(self.bg_offset) % tile_w
        tile_surf = pygame.Surface((SCREEN_W, SCREEN_H - GROUND_Y), pygame.SRCALPHA)
        for x in range(-tile_off, SCREEN_W, tile_w):
            pygame.draw.line(tile_surf, (*lvl["glow"], 40),
                             (x, 0), (x, SCREEN_H - GROUND_Y))
        self.screen.blit(tile_surf, (0, GROUND_Y))

    def draw_obstacles(self):
        lvl = LEVELS[self.level_idx]
        for obs in self.obstacles:
            sx = int(obs["x"] - self.bg_offset)
            if sx + obs["w"] < -10:
                continue
            if sx > SCREEN_W + 10:
                break
            if obs["type"] == "spike":
                draw_spike(self.screen, sx, lvl, 1)
            elif obs["type"] == "double_spike":
                draw_spike(self.screen, sx, lvl, 2)
            else:
                draw_block(self.screen, sx, obs["h"], lvl)

    def draw_hud(self):
        lvl = LEVELS[self.level_idx]
        # Название уровня
        name_surf = self.font_small.render(lvl["name"], True, lvl["glow"])
        self.screen.blit(name_surf, (16, 12))
        # Счёт
        score_surf = self.font_med.render(str(self.score), True, C_WHITE)
        self.screen.blit(score_surf, (SCREEN_W - score_surf.get_width() - 20, 12))

    def draw_menu(self):
        # Затемнение
        overlay = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
        overlay.fill((4, 0, 18, 210))
        self.screen.blit(overlay, (0, 0))

        title = self.font_big.render("GEOMETRY DASH", True, (68, 170, 255))
        sub   = self.font_small.render("Python Edition  —  выбери уровень", True, (100, 140, 220))
        self.screen.blit(title, (SCREEN_W // 2 - title.get_width() // 2, 60))
        self.screen.blit(sub,   (SCREEN_W // 2 - sub.get_width() // 2, 118))

        # Кнопки уровней
        stars_txt = ["★☆☆  Легко", "★★☆  Средне", "★★★  Сложно"]
        for i, lvl in enumerate(LEVELS):
            bx = 120 + i * 230
            by = 180
            bw, bh = 200, 90
            selected = self.level_idx == i
            color = lvl["glow"]
            bg_a = 160 if selected else 40
            bg = pygame.Surface((bw, bh), pygame.SRCALPHA)
            bg.fill((*color, bg_a))
            self.screen.blit(bg, (bx, by))
            pygame.draw.rect(self.screen, color, (bx, by, bw, bh), 2, border_radius=8)

            n_surf = self.font_small.render(lvl["name"], True, color if not selected else (0, 0, 0))
            s_surf = self.font_small.render(stars_txt[i], True, (200, 200, 200) if not selected else (0, 0, 0))
            self.screen.blit(n_surf, (bx + bw // 2 - n_surf.get_width() // 2, by + 18))
            self.screen.blit(s_surf, (bx + bw // 2 - s_surf.get_width() // 2, by + 46))

            if self.best_scores[i] > 0:
                b_surf = self.font_small.render(f"Рекорд: {self.best_scores[i]}", True, (180, 180, 180))
                self.screen.blit(b_surf, (bx + bw // 2 - b_surf.get_width() // 2, by + 68))

        # Кнопка играть
        play_txt = self.font_med.render("[ ПРОБЕЛ — ИГРАТЬ ]", True, LEVELS[self.level_idx]["glow"])
        self.screen.blit(play_txt, (SCREEN_W // 2 - play_txt.get_width() // 2, 310))

        hint = self.font_small.render("← → или 1/2/3 — выбор уровня", True, (60, 80, 120))
        self.screen.blit(hint, (SCREEN_W // 2 - hint.get_width() // 2, 360))

    def draw_dead(self):
        overlay = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
        overlay.fill((16, 0, 8, 210))
        self.screen.blit(overlay, (0, 0))

        dead_txt  = self.font_big.render("ПРОВАЛ", True, (255, 40, 100))
        score_txt = self.font_med.render(f"Счёт: {self.score}", True, C_WHITE)
        best_txt  = self.font_med.render(
            f"Рекорд: {max(self.score, self.best_scores[self.level_idx])}", True,
            LEVELS[self.level_idx]["glow"]
        )
        retry_txt = self.font_small.render("[ ПРОБЕЛ — ещё раз ]   [ ESC — меню ]", True, (160, 160, 160))

        self.screen.blit(dead_txt,  (SCREEN_W // 2 - dead_txt.get_width() // 2, 140))
        self.screen.blit(score_txt, (SCREEN_W // 2 - score_txt.get_width() // 2, 220))
        self.screen.blit(best_txt,  (SCREEN_W // 2 - best_txt.get_width() // 2, 260))
        self.screen.blit(retry_txt, (SCREEN_W // 2 - retry_txt.get_width() // 2, 330))

    def run(self):
        while True:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    sys.exit()

                if event.type == pygame.KEYDOWN:
                    if event.key in (pygame.K_SPACE, pygame.K_UP):
                        if self.state == "menu":
                            self.reset_game()
                            self.state = "playing"
                        elif self.state == "playing":
                            self.jump()
                        elif self.state == "dead":
                            self.reset_game()
                            self.state = "playing"

                    elif event.key == pygame.K_ESCAPE:
                        if self.state in ("dead", "playing"):
                            self.state = "menu"

                    elif event.key in (pygame.K_LEFT, pygame.K_a):
                        if self.state == "menu":
                            self.level_idx = (self.level_idx - 1) % 3

                    elif event.key in (pygame.K_RIGHT, pygame.K_d):
                        if self.state == "menu":
                            self.level_idx = (self.level_idx + 1) % 3

                    elif event.key == pygame.K_1:
                        if self.state == "menu":
                            self.level_idx = 0
                    elif event.key == pygame.K_2:
                        if self.state == "menu":
                            self.level_idx = 1
                    elif event.key == pygame.K_3:
                        if self.state == "menu":
                            self.level_idx = 2

                if event.type == pygame.MOUSEBUTTONDOWN:
                    if self.state == "playing":
                        self.jump()

            self.update()

            # Рисуем фон всегда
            self.draw_background()
            self.draw_obstacles()

            if self.alive and self.state == "playing":
                draw_cube(self.screen, PLAYER_X, int(self.player_y), self.rotation,
                          LEVELS[self.level_idx])
            elif self.state in ("dead", "playing"):
                draw_cube(self.screen, PLAYER_X, int(self.player_y), self.rotation,
                          LEVELS[self.level_idx])

            # Частицы
            for p in self.particles:
                p.draw(self.screen)

            if self.state == "playing":
                self.draw_hud()
            elif self.state == "menu":
                self.draw_background()
                self.draw_menu()
            elif self.state == "dead":
                self.draw_dead()
                for p in self.particles:
                    p.draw(self.screen)

            pygame.display.flip()
            self.clock.tick(FPS)


if __name__ == "__main__":
    Game().run()
