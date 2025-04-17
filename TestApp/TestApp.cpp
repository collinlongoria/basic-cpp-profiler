#include "Profiler.hpp"
#include <iostream>
#include <thread>
#include <vector>
#include <chrono>
#include <cstdlib>
#include <random>

std::random_device rd;
std::mt19937 rng(rd());
std::uniform_int_distribution<int> dist(1, 3);

// === Feature Toggles ===
#define TEST_TIME_TRACKING        true
#define TEST_CALL_GRAPH           true
#define TEST_MEMORY_SAMPLING      true
#define TEST_THREAD_TIMELINE      true
#define TEST_ALLOCATION_TRACKING  true
#define TEST_DURATION_HISTOGRAM   true

// === Test Code ===
#if TEST_CALL_GRAPH || TEST_TIME_TRACKING || TEST_DURATION_HISTOGRAM
void NestedWork() {
    PROFILE_FUNCTION();
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
}

void DoWork() {
    PROFILE_FUNCTION();
    NestedWork();
    std::this_thread::sleep_for(std::chrono::milliseconds(30));
}

void NestedWork2() {
    PROFILE_FUNCTION();

    std::this_thread::sleep_for(std::chrono::milliseconds(17));

}

void NestedWork3() {
    PROFILE_FUNCTION();

    int result1 = dist(rng);
    int result2 = dist(rng);

    int result3 = result1 * result2 + (result2 * 10);

    std::this_thread::sleep_for(std::chrono::milliseconds(result3));
}

void NestedWork5() {
    PROFILE_FUNCTION();

    std::this_thread::sleep_for(std::chrono::milliseconds(9));
}

void NestedWork4() {
    PROFILE_FUNCTION();

    NestedWork5();

    std::this_thread::sleep_for(std::chrono::milliseconds(9));
}



void DoWorkRandom() {
    PROFILE_FUNCTION();

    int result = dist(rng);

    switch (result) {
    case 1:
    default:
        for (int i = 0; i < 2; ++i) NestedWork2();
        break;
    case 2:
        for(int i = 0; i< 1; ++i) NestedWork3();
        break;
    case 3:
        NestedWork4();
        break;
    }
}
#endif

#if TEST_ALLOCATION_TRACKING
void SimulateAllocations() {
    PROFILE_FUNCTION();
    std::vector<void*> blocks;
    for (int i = 0; i < 25; ++i) {
        size_t size = (rand() % 1024) + 64;
        blocks.push_back(malloc(size));
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
    for (void* ptr : blocks) free(ptr);
}
#endif

#if TEST_THREAD_TIMELINE
void BackgroundThread() {
    Profiler::MarkThreadEvent("BG Start");
    for (int i = 0; i < 3; ++i) {
        SimulateAllocations();
        std::this_thread::sleep_for(std::chrono::milliseconds(40));
    }
    Profiler::MarkThreadEvent("BG End");
}
#endif

int main() {

    std::cout << "Starting profiler test..." << std::endl;

    Profiler::SetOutputPath("profile_output.json");
    Profiler::BeginSession();

#if TEST_MEMORY_SAMPLING
    Profiler::StartMemorySampler(50);
#endif

#if TEST_ALLOCATION_TRACKING
    Profiler::EnableAllocationTracking(true);
#endif

#if TEST_THREAD_TIMELINE
    std::thread bg(BackgroundThread);
#endif

#if TEST_TIME_TRACKING || TEST_CALL_GRAPH || TEST_DURATION_HISTOGRAM
    for (int i = 0; i < 5; ++i)
        DoWork();

    for (int i = 0; i < 8; ++i)
        DoWorkRandom();

    NestedWork5();
#endif

#if TEST_ALLOCATION_TRACKING
    SimulateAllocations();
#endif

#if TEST_THREAD_TIMELINE
    bg.join();
#endif

#if TEST_MEMORY_SAMPLING
    Profiler::StopMemorySampler();
#endif

    Profiler::EndSession();
    std::cout << "Profiler output written to profile_output.json" << std::endl;
    return 0;
}

