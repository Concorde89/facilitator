plugins {
    kotlin("jvm") version "1.9.22"
    kotlin("plugin.serialization") version "1.9.22"
    `maven-publish`
    `java-library`
}

group = "online.autoincentive"
version = "1.0.0"

repositories {
    mavenCentral()
    google()
}

dependencies {
    // Kotlin
    implementation(kotlin("stdlib"))

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // JSON Serialization
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")

    // Testing
    testImplementation(kotlin("test"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
}

java {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
    withSourcesJar()
    withJavadocJar()
}

kotlin {
    jvmToolchain(11)
}

tasks.test {
    useJUnitPlatform()
}

publishing {
    publications {
        create<MavenPublication>("maven") {
            groupId = "online.autoincentive"
            artifactId = "facilitator-sdk"
            version = "1.0.0"

            from(components["java"])

            pom {
                name.set("AutoIncentive Facilitator SDK")
                description.set("Kotlin SDK for x402 payment verification and settlement")
                url.set("https://github.com/Concorde89/facilitator")

                licenses {
                    license {
                        name.set("MIT License")
                        url.set("https://opensource.org/licenses/MIT")
                    }
                }

                developers {
                    developer {
                        id.set("autoincentive")
                        name.set("Autoincentive")
                        email.set("contact@autoincentive.online")
                    }
                }

                scm {
                    connection.set("scm:git:git://github.com/Concorde89/facilitator.git")
                    developerConnection.set("scm:git:ssh://github.com/Concorde89/facilitator.git")
                    url.set("https://github.com/Concorde89/facilitator")
                }
            }
        }
    }

    repositories {
        maven {
            name = "GitHubPackages"
            url = uri("https://maven.pkg.github.com/Concorde89/facilitator")
            credentials {
                username = System.getenv("GITHUB_ACTOR") ?: ""
                password = System.getenv("GITHUB_TOKEN") ?: ""
            }
        }
    }
}
