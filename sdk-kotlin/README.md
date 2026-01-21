# AutoIncentive Facilitator SDK for Kotlin/Android

Kotlin SDK for integrating x402 payment verification and settlement into Android applications.

## Installation

### Gradle (Kotlin DSL)

```kotlin
dependencies {
    implementation("online.autoincentive:facilitator-sdk:1.0.0")
}
```

### Gradle (Groovy)

```groovy
dependencies {
    implementation 'online.autoincentive:facilitator-sdk:1.0.0'
}
```

### JitPack

Add JitPack repository:

```kotlin
repositories {
    maven { url = uri("https://jitpack.io") }
}

dependencies {
    implementation("com.github.Concorde89:facilitator:sdk-kotlin-1.0.0")
}
```

## Quick Start

```kotlin
import online.autoincentive.facilitator.FacilitatorClient
import kotlinx.coroutines.runBlocking

fun main() = runBlocking {
    val client = FacilitatorClient.create()

    // Check health
    val health = client.health()
    println("Status: ${health.status}") // "ok"

    // Get supported networks
    val supported = client.supported()
    supported.kinds.forEach { kind ->
        println("Network: ${kind.network}")
    }
}
```

## Android Usage

### Basic Setup

```kotlin
import online.autoincentive.facilitator.FacilitatorClient
import online.autoincentive.facilitator.FacilitatorConfig

class PaymentRepository {
    private val client = FacilitatorClient(
        FacilitatorConfig(
            baseUrl = "https://facilitator.x402endpoints.online",
            timeoutMs = 30000
        )
    )

    suspend fun checkHealth(): Boolean {
        return client.isHealthy()
    }

    suspend fun getSupportedNetworks(): List<String> {
        val supported = client.supported()
        return supported.kinds.map { it.network }
    }
}
```

### ViewModel Example

```kotlin
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import online.autoincentive.facilitator.FacilitatorClient
import online.autoincentive.facilitator.VerifyResponse

class PaymentViewModel : ViewModel() {
    private val client = FacilitatorClient.create()

    private val _verifyResult = MutableStateFlow<VerifyResponse?>(null)
    val verifyResult: StateFlow<VerifyResponse?> = _verifyResult

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    fun verifyPayment(
        paymentPayload: PaymentPayload,
        requirements: PaymentRequirements
    ) {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null

            try {
                val result = client.verify(paymentPayload, requirements)
                _verifyResult.value = result

                if (!result.isValid) {
                    _error.value = result.invalidReason ?: "Payment verification failed"
                }
            } catch (e: FacilitatorException) {
                _error.value = "Error ${e.statusCode}: ${e.message}"
            } catch (e: Exception) {
                _error.value = e.message ?: "Unknown error"
            } finally {
                _isLoading.value = false
            }
        }
    }
}
```

### Compose UI Example

```kotlin
@Composable
fun PaymentScreen(viewModel: PaymentViewModel = viewModel()) {
    val verifyResult by viewModel.verifyResult.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()

    Column(modifier = Modifier.padding(16.dp)) {
        if (isLoading) {
            CircularProgressIndicator()
        }

        error?.let { errorMessage ->
            Text(
                text = errorMessage,
                color = MaterialTheme.colorScheme.error
            )
        }

        verifyResult?.let { result ->
            if (result.isValid) {
                Text("Payment verified!")
                Text("Payer: ${result.payer}")
            }
        }

        Button(
            onClick = { /* trigger verification */ },
            enabled = !isLoading
        ) {
            Text("Verify Payment")
        }
    }
}
```

## API Reference

### FacilitatorClient

#### Constructor

```kotlin
val client = FacilitatorClient(
    config = FacilitatorConfig(
        baseUrl = "https://facilitator.x402endpoints.online",
        timeoutMs = 30000,
        headers = mapOf("X-Custom-Header" to "value")
    )
)

// Or use factory method
val client = FacilitatorClient.create()
```

### Core x402 Methods

#### `health()`

Check facilitator health status.

```kotlin
val health = client.health()
// HealthResponse(status="ok", timestamp="2025-01-20T...")
```

#### `supported()`

Get supported networks and signers.

```kotlin
val supported = client.supported()
// SupportedResponse(
//   kinds=[SupportedKind(network="eip155:8453"), ...],
//   signers={"eip155:*": ["0x..."], "solana:*": ["..."]}
// )
```

#### `verify(paymentPayload, paymentRequirements)`

Verify a payment signature.

```kotlin
val result = client.verify(paymentPayload, requirements)
// VerifyResponse(isValid=true, payer="0x...")
// or VerifyResponse(isValid=false, invalidReason="invalid_signature")
```

#### `settle(paymentPayload, paymentRequirements)`

Settle a payment (execute the transfer).

```kotlin
val result = client.settle(paymentPayload, requirements)
// SettleResponse(success=true, transaction="0x...", network="eip155:8453")
```

### Discovery / Bazaar Methods

#### `listResources(type?, limit?, offset?)`

List discovered x402-enabled resources.

```kotlin
val resources = client.listResources(
    type = "http",
    limit = 20,
    offset = 0
)
```

#### `registerResource(resource)`

Register a resource manually.

```kotlin
client.registerResource(
    DiscoveredResource(
        resource = "https://api.example.com/endpoint",
        type = "http",
        x402Version = 2,
        accepts = listOf(
            AcceptedPayment(
                scheme = "exact",
                network = "eip155:8453",
                amount = "100000",
                asset = "USDC",
                payTo = "0x..."
            )
        ),
        lastUpdated = "2025-01-20T00:00:00Z"
    )
)
```

#### `getDiscoveryStats()`

Get discovery registry statistics.

```kotlin
val stats = client.getDiscoveryStats()
// DiscoveryStats(totalResources=42, networks={"eip155:8453": 30}, ...)
```

### OASF Methods

#### `getOASFRecord()`

Get the OASF agent record.

```kotlin
val record = client.getOASFRecord()
// OASFAgentRecord(name="AutoIncentive Facilitator", ...)
```

#### `getOASFSkills()`

Get the list of OASF skills.

```kotlin
val skills = client.getOASFSkills()
// OASFSkillsResponse(agent="...", skills=[...])
```

### Utility Methods

#### `isHealthy()`

Quick check if facilitator is healthy.

```kotlin
val healthy = client.isHealthy() // true or false
```

#### `isNetworkSupported(network)`

Check if a network is supported.

```kotlin
val supported = client.isNetworkSupported("eip155:8453") // true
```

#### `getSignerForNetwork(network)`

Get the signer address for a network.

```kotlin
val signer = client.getSignerForNetwork("base")
// "0xDCab6a5ddEB65De28BEDD218F9be1DBf5011D02C"
```

## Error Handling

The SDK throws `FacilitatorException` for API errors:

```kotlin
try {
    val result = client.verify(payload, requirements)
} catch (e: FacilitatorException) {
    println("Error ${e.statusCode}: ${e.message}")
    println("Details: ${e.details}")
}
```

## Supported Networks

| Network | ID | Type |
|---------|-----|------|
| Base Mainnet | `base` or `eip155:8453` | EVM |
| Base Sepolia | `base-sepolia` or `eip155:84532` | EVM |
| Solana Mainnet | `solana` or `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | Solana |
| Solana Devnet | `solana-devnet` or `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | Solana |

## ProGuard Rules

If using ProGuard/R8, add these rules:

```proguard
-keep class online.autoincentive.facilitator.** { *; }
-keepclassmembers class online.autoincentive.facilitator.** { *; }

# Kotlinx Serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class online.autoincentive.facilitator.**$$serializer { *; }
-keepclassmembers class online.autoincentive.facilitator.** {
    *** Companion;
}
-keepclasseswithmembers class online.autoincentive.facilitator.** {
    kotlinx.serialization.KSerializer serializer(...);
}
```

## Requirements

- Android API 21+ (Lollipop)
- Kotlin 1.9+
- Java 11+

## License

MIT
