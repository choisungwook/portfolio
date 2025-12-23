#include <stdio.h>
#include <unistd.h>

int main() {
    printf("User Space Program Running (PID: %d)\n", getpid());

    while(1) {
        printf("Still running...\n");
        sleep(5);
    }

    return 0;
}
