

#include <iostream>
#include <vector>
#include <string>
#include <cmath>
#include <cstdlib>
#include <ctime>
#include <thread>
#include <chrono>
#include <algorithm>
#include <queue>
#include <map>
#include <memory>
#include <mutex>
#include <random>

#ifdef _WIN32
    #include <windows.h>
    #include <conio.h>
#else
    #include <unistd.h>
    #include <termios.h>
    #include <fcntl.h>
#endif

using namespace std;
using namespace chrono;

// ============================== CONFIGURATION ==============================
const int WORLD_WIDTH = 80;
const int WORLD_HEIGHT = 24;
const double PI = 3.14159265358979323846;

// ============================== UTILITY FUNCTIONS ==============================
#ifdef _WIN32
    void clearScreen() {
        system("cls");
    }
    
    void gotoxy(int x, int y) {
        COORD coord;
        coord.X = x;
        coord.Y = y;
        SetConsoleCursorPosition(GetStdHandle(STD_OUTPUT_HANDLE), coord);
    }
    
    bool hit() {
        return _kbhit();
    }
    
    char get() {
        return _getch();
    }
#else
    void clearScreen() {
        cout << "\033[2J\033[1;1H";
    }
    
    void gotoxy(int x, int y) {
        cout << "\033[" << y << ";" << x << "H";
    }
    
    bool kbhit() {
        struct termios oldt, newt;
        int ch;
        int oldf;
        
        tcgetattr(STDIN_FILENO, &oldt);
        newt = oldt;
        newt.c_lflag &= ~(ICANON | ECHO);
        tcsetattr(STDIN_FILENO, TCSANOW, &newt);
        oldf = fcntl(STDIN_FILENO, F_GETFL, 0);
        fcntl(STDIN_FILENO, F_SETFL, oldf | O_NONBLOCK);
        
        ch = getchar();
        
        tcsetattr(STDIN_FILENO, TCSANOW, &oldt);
        fcntl(STDIN_FILENO, F_SETFL, oldf);
        
        if(ch != EOF) {
            ungetc(ch, stdin);
            return true;
        }
        
        return false;
    }
    
    char getch() {
        char buf = 0;
        struct termios old = {0};
        fflush(stdout);
        if(tcgetattr(0, &old) < 0)
            perror("tcsetattr()");
        old.c_lflag &= ~ICANON;
        old.c_lflag &= ~ECHO;
        old.c_cc[VMIN] = 1;
        old.c_cc[VTIME] = 0;
        if(tcsetattr(0, TCSANOW, &old) < 0)
            perror("tcsetattr ICANON");
        if(read(0, &buf, 1) < 0)
            perror("read()");
        old.c_lflag |= ICANON;
        old.c_lflag |= ECHO;
        if(tcsetattr(0, TCSADRAIN, &old) < 0)
            perror("tcsetattr ~ICANON");
        return buf;
    }
#endif

// ============================== VECTOR MATH ==============================
struct Vector2D {
    double x, y;
    
    Vector2D() : x(0), y(0) {}
    Vector2D(double x, double y) : x(x), y(y) {}
    
    Vector2D operator+(const Vector2D& other) const {
        return Vector2D(x + other.x, y + other.y);
    }
    
    Vector2D operator-(const Vector2D& other) const {
        return Vector2D(x - other.x, y - other.y);
    }
    
    Vector2D operator*(double scalar) const {
        return Vector2D(x * scalar, y * scalar);
    }
    
    double length() const {
        return sqrt(x*x + y*y);
    }
    
    void normalize() {
        double len = length();
        if (len > 0) {
            x /= len;
            y /= len;
        }
    }
    
    double distanceTo(const Vector2D& other) const {
        double dx = x - other.x;
        double dy = y - other.y;
        return sqrt(dx*dx + dy*dy);
    }
};

// ============================== OBSTACLE CLASS ==============================
class Obstacle {
public:
    Vector2D position;
    double radius;
    char symbol;
    
    Obstacle(double x, double y, double r, char sym = '#') 
        : position(x, y), radius(r), symbol(sym) {}
    
    bool collidesWith(const Vector2D& point, double margin = 0.5) const {
        return position.distanceTo(point) < radius + margin;
    }
};

// ============================== SENSOR CLASS ==============================
class Sensor {
public:
    double range;
    double fieldOfView;
    vector<double> readings;
    
    Sensor(double r, double fov) : range(r), fieldOfView(fov) {}
    
    virtual vector<double> read(const Vector2D& position, double direction, 
                                const vector<Obstacle>& obstacles) {
        readings.clear();
        int numReadings = 8;
        double angleStep = fieldOfView / numReadings;
        double startAngle = direction - fieldOfView / 2;
        
        for (int i = 0; i <= numReadings; i++) {
            double angle = startAngle + i * angleStep;
            double closest = range;
            
            Vector2D sensorDir(cos(angle), sin(angle));
            
            for (const auto& obs : obstacles) {
                Vector2D toObstacle = obs.position - position;
                double proj = toObstacle.x * sensorDir.x + toObstacle.y * sensorDir.y;
                
                if (proj > 0) {
                    Vector2D closestPoint = position + sensorDir * proj;
                    double distance = closestPoint.distanceTo(obs.position);
                    
                    if (distance < obs.radius) {
                        double hitDistance = proj - sqrt(obs.radius*obs.radius - distance*distance);
                        if (hitDistance < closest) {
                            closest = hitDistance;
                        }
                    }
                }
            }
            
            readings.push_back(closest);
        }
        
        return readings;
    }
};

// ============================== ROBOT BASE CLASS ==============================
class Robot {
protected:
    Vector2D position;
    double orientation;
    double speed;
    double maxSpeed;
    double rotationSpeed;
    string name;
    char symbol;
    bool active;
    unique_ptr<Sensor> sensor;
    Vector2D target;
    bool hasTarget;
    
public:
    Robot(string n, char sym, double x, double y) 
        : name(n), symbol(sym), active(true), hasTarget(false) {
        position = Vector2D(x, y);
        orientation = 0;
        speed = 0;
        maxSpeed = 2.0;
        rotationSpeed = 0.1;
        sensor = make_unique<Sensor>(10.0, PI / 2);
    }
    
    virtual ~Robot() {}
    
    virtual void update(const vector<Obstacle>& obstacles) {
        if (!active) return;
        
        // Simple obstacle avoidance using sensor readings
        auto readings = sensor->read(position, orientation, obstacles);
        
        // Find closest obstacle
        double minDistance = sensor->range;
        int closestIndex = -1;
        
        for (size_t i = 0; i < readings.size(); i++) {
            if (readings[i] < minDistance) {
                minDistance = readings[i];
                closestIndex = i;
            }
        }
        
        // Avoid obstacle if too close
        if (minDistance < 2.0) {
            // Turn away from obstacle
            double avoidanceAngle = (closestIndex - readings.size()/2) * 0.2;
            orientation += avoidanceAngle;
            speed = maxSpeed * 0.5;
        } else if (hasTarget) {
            // Move towards target
            Vector2D toTarget = target - position;
            double targetAngle = atan2(toTarget.y, toTarget.x);
            double angleDiff = targetAngle - orientation;
            
            // Normalize angle difference
            while (angleDiff > PI) angleDiff -= 2*PI;
            while (angleDiff < -PI) angleDiff += 2*PI;
            
            // Turn towards target
            orientation += angleDiff * 0.1;
            speed = maxSpeed;
        } else {
            // Wander behavior
            speed = maxSpeed * 0.7;
            orientation += (rand() % 100 - 50) * 0.02;
        }
        
        // Update position
        position.x += cos(orientation) * speed;
        position.y += sin(orientation) * speed;
        
        // Boundary checking
        position.x = max(1.0, min((double)WORLD_WIDTH - 2, position.x));
        position.y = max(1.0, min((double)WORLD_HEIGHT - 2, position.y));
    }
    
    void setTarget(double x, double y) {
        target = Vector2D(x, y);
        hasTarget = true;
    }
    
    void clearTarget() {
        hasTarget = false;
    }
    
    void setActive(bool a) { active = a; }
    Vector2D getPosition() const { return position; }
    string getName() const { return name; }
    char getSymbol() const { return symbol; }
    bool isActive() const { return active; }
    
    virtual void render() const {
        if (active) {
            gotoxy((int)position.x, (int)position.y);
            cout << symbol;
            
            // Draw orientation indicator
            int dirX = (int)(position.x + cos(orientation) * 1.5);
            int dirY = (int)(position.y + sin(orientation) * 1.5);
            if (dirX >= 1 && dirX <= WORLD_WIDTH && dirY >= 1 && dirY <= WORLD_HEIGHT) {
                gotoxy(dirX, dirY);
                cout << ".";
            }
        }
    }
    
    virtual void printStatus() const {
        cout << name << " @ (" << (int)position.x << "," << (int)position.y 
             << ") | Speed: " << (int)(speed/maxSpeed*100) << "%";
        if (hasTarget) {
            cout << " | Target: (" << (int)target.x << "," << (int)target.y << ")";
        }
    }
};

// ============================== SPECIALIZED ROBOTS ==============================
class ExplorerRobot : public Robot {
public:
    ExplorerRobot(double x, double y) : Robot("Explorer", 'E', x, y) {
        maxSpeed = 3.0;
        rotationSpeed = 0.15;
        sensor = make_unique<Sensor>(15.0, PI / 1.5);
    }
    
    void update(const vector<Obstacle>& obstacles) override {
        // Explorer moves faster and explores more aggressively
        Robot::update(obstacles);
        
        // Random direction changes for exploration
        if (rand() % 100 < 2) {
            orientation += (rand() % 100 - 50) * 0.1;
        }
    }
};

class DefenderRobot : public Robot {
private:
    Vector2D patrolPoint1;
    Vector2D patrolPoint2;
    bool movingToPoint2;
    
public:
    DefenderRobot(double x, double y) : Robot("Defender", 'D', x, y) {
        maxSpeed = 1.5;
        rotationSpeed = 0.08;
        patrolPoint1 = Vector2D(x, y);
        patrolPoint2 = Vector2D(WORLD_WIDTH - x, WORLD_HEIGHT - y);
        movingToPoint2 = true;
        sensor = make_unique<Sensor>(12.0, PI);
    }
    
    void update(const vector<Obstacle>& obstacles) override {
        // Patrol behavior
        if (movingToPoint2) {
            setTarget(patrolPoint2.x, patrolPoint2.y);
            if (position.distanceTo(patrolPoint2) < 1.0) {
                movingToPoint2 = false;
            }
        } else {
            setTarget(patrolPoint1.x, patrolPoint1.y);
            if (position.distanceTo(patrolPoint1) < 1.0) {
                movingToPoint2 = true;
            }
        }
        
        Robot::update(obstacles);
    }
};

class FastRobot : public Robot {
public:
    FastRobot(double x, double y) : Robot("Fast", 'F', x, y) {
        maxSpeed = 5.0;
        rotationSpeed = 0.25;
        sensor = make_unique<Sensor>(8.0, PI / 3);
    }
    
    void update(const vector<Obstacle>& obstacles) override {
        Robot::update(obstacles);
        
        // Fast robot has less precise obstacle avoidance
        auto readings = sensor->read(position, orientation, obstacles);
        for (double dist : readings) {
            if (dist < 1.0) {
                speed = maxSpeed * 0.3;  // Slams brakes
                break;
            }
        }
    }
};

// ============================== WORLD MANAGER ==============================
class World {
private:
    vector<unique_ptr<Robot>> robots;
    vector<Obstacle> obstacles;
    bool running;
    int selectedRobot;
    
public:
    World() : running(true), selectedRobot(0) {
        srand(time(nullptr));
        initializeWorld();
    }
    
    void initializeWorld() {
        // Create obstacles
        obstacles.emplace_back(20, 10, 2.0, '#');
        obstacles.emplace_back(60, 15, 2.5, '#');
        obstacles.emplace_back(40, 5, 1.5, '#');
        obstacles.emplace_back(30, 20, 2.0, '#');
        obstacles.emplace_back(70, 8, 1.8, '#');
        obstacles.emplace_back(10, 18, 1.5, '#');
        obstacles.emplace_back(50, 12, 3.0, 'O');
        
        // Create robots
        robots.push_back(make_unique<ExplorerRobot>(15, 12));
        robots.push_back(make_unique<DefenderRobot>(40, 15));
        robots.push_back(make_unique<FastRobot>(65, 8));
        robots.push_back(make_unique<ExplorerRobot>(5, 5));
        robots.push_back(make_unique<FastRobot>(75, 20));
    }
    
    void update() {
        for (auto& robot : robots) {
            robot->update(obstacles);
        }
    }
    
    void render() {
        clearScreen();
        
        // Draw borders
        for (int i = 0; i <= WORLD_WIDTH + 1; i++) {
            gotoxy(i, 0);
            cout << "=";
            gotoxy(i, WORLD_HEIGHT + 1);
            cout << "=";
        }
        for (int i = 0; i <= WORLD_HEIGHT + 1; i++) {
            gotoxy(0, i);
            cout << "|";
            gotoxy(WORLD_WIDTH + 1, i);
            cout << "|";
        }
        
        // Draw obstacles
        for (const auto& obs : obstacles) {
            for (int y = -obs.radius; y <= obs.radius; y++) {
                for (int x = -obs.radius; x <= obs.radius; x++) {
                    int px = (int)(obs.position.x + x);
                    int py = (int)(obs.position.y + y);
                    if (px >= 1 && px <= WORLD_WIDTH && py >= 1 && py <= WORLD_HEIGHT) {
                        if (x*x + y*y <= obs.radius*obs.radius) {
                            gotoxy(px, py);
                            cout << obs.symbol;
                        }
                    }
                }
            }
        }
        
        // Draw robots
        for (const auto& robot : robots) {
            robot->render();
        }
        
        // Draw UI
        gotoxy(2, WORLD_HEIGHT + 3);
        cout << "=== ROBOT SIMULATION ===";
        gotoxy(2, WORLD_HEIGHT + 4);
        cout << "Commands: [1-5] Select Robot | [T] Set Target | [C] Clear Target";
        gotoxy(2, WORLD_HEIGHT + 5);
        cout << "          [Space] Pause/Resume | [Q] Quit";
        
        // Draw robot status
        gotoxy(2, WORLD_HEIGHT + 7);
        cout << "Selected Robot: " << robots[selectedRobot]->getName();
        gotoxy(2, WORLD_HEIGHT + 8);
        robots[selectedRobot]->printStatus();
        
        // Draw instructions for target setting
        if (settingTarget) {
            gotoxy(2, WORLD_HEIGHT + 10);
            cout << "Click on the map to set target for " << robots[selectedRobot]->getName();
        }
        
        // Draw FPS counter
        gotoxy(WORLD_WIDTH - 10, WORLD_HEIGHT + 3);
        cout << "FPS: " << fps;
        
        fflush(stdout);
    }
    
    void handleInput() {
        if (kbhit()) {
            char key = getch();
            
            switch (key) {
                case '1': case '2': case '3': case '4': case '5':
                    selectedRobot = key - '1';
                    if (selectedRobot >= robots.size()) selectedRobot = 0;
                    break;
                    
                case 't': case 'T':
                    setTargetForRobot();
                    break;
                    
                case 'c': case 'C':
                    robots[selectedRobot]->clearTarget();
                    break;
                    
                case ' ':
                    running = !running;
                    break;
                    
                case 'q': case 'Q':
                    exit(0);
                    break;
            }
        }
    }
    
    void setTargetForRobot() {
        clearScreen();
        render();
        gotoxy(2, WORLD_HEIGHT + 10);
        cout << "Move cursor with arrow keys and press Enter to set target";
        gotoxy(2, WORLD_HEIGHT + 11);
        cout << "Press ESC to cancel                                ";
        
        int cursorX = WORLD_WIDTH / 2;
        int cursorY = WORLD_HEIGHT / 2;
        
        while (true) {
            gotoxy(cursorX, cursorY);
            cout << "+";
            gotoxy(cursorX, cursorY);
            fflush(stdout);
            
            if (kbhit()) {
                char key = getch();
                
                // Clear cursor
                gotoxy(cursorX, cursorY);
                cout << " ";
                
                if (key == 27) { // ESC
                    break;
                } else if (key == 13) { // Enter
                    robots[selectedRobot]->setTarget(cursorX, cursorY);
                    break;
                } else if (key == 224) { // Arrow keys
                    key = getch();
                    switch (key) {
                        case 72: cursorY = max(1, cursorY - 1); break; // Up
                        case 80: cursorY = min(WORLD_HEIGHT, cursorY + 1); break; // Down
                        case 75: cursorX = max(1, cursorX - 1); break; // Left
                        case 77: cursorX = min(WORLD_WIDTH, cursorX + 1); break; // Right
                    }
                }
            }
        }
        
        // Clear cursor
        gotoxy(cursorX, cursorY);
        cout << " ";
    }
    
    void run() {
        auto lastTime = steady_clock::now();
        int frameCount = 0;
        fps = 0;
        settingTarget = false;
        
        while (true) {
            auto currentTime = steady_clock::now();
            auto elapsed = duration_cast<milliseconds>(currentTime - lastTime).count();
            
            if (elapsed >= 1000) {
                fps = frameCount;
                frameCount = 0;
                lastTime = currentTime;
            }
            
            handleInput();
            
            if (running) {
                update();
            }
            
            render();
            frameCount++;
            
            this_thread::sleep_for(milliseconds(50));
        }
    }
    
private:
    int fps;
    bool settingTarget;
};

// ============================== MAIN FUNCTION ==============================
int main() {
    cout << "Initializing Robot Simulation..." << endl;
    this_thread::sleep_for(seconds(1));
    
    World world;
    world.run();
    
    return 0;
}