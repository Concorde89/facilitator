# Android Integration Guide

This guide covers integrating x402 payments into Android applications using the AutoIncentive Facilitator SDK.

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Architecture Patterns](#architecture-patterns)
5. [Complete Example App](#complete-example-app)
6. [Payment Flow](#payment-flow)
7. [Error Handling](#error-handling)
8. [Testing](#testing)
9. [Security Considerations](#security-considerations)

## Overview

The x402 protocol enables HTTP 402 "Payment Required" responses for monetizing APIs. The AutoIncentive Facilitator handles payment verification and settlement on Base (EVM), SKALE Base, and Solana networks.

**What the SDK provides:**
- Payment verification before fulfilling requests
- Payment settlement (executing transfers)
- Discovery of x402-enabled endpoints (Bazaar)
- OASF agent metadata

**What you need to implement:**
- Wallet integration for signing payments
- UI for payment confirmation
- Business logic for your monetized endpoints

## Installation

### Option 1: JitPack (Recommended)

Add JitPack to your root `build.gradle.kts`:

```kotlin
allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://jitpack.io") }
    }
}
```

Add the dependency in your app's `build.gradle.kts`:

```kotlin
dependencies {
    implementation("com.github.Concorde89:facilitator:sdk-kotlin-1.0.0")
}
```

### Option 2: Manual AAR

1. Download the AAR from [releases](https://github.com/Concorde89/facilitator/releases)
2. Place in `app/libs/`
3. Add to dependencies:

```kotlin
dependencies {
    implementation(files("libs/facilitator-sdk-1.0.0.aar"))
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")
}
```

### Required Permissions

Add to `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

## Quick Start

```kotlin
import online.autoincentive.facilitator.FacilitatorClient

// Create client
val facilitator = FacilitatorClient.create()

// Check if service is available
lifecycleScope.launch {
    val isHealthy = facilitator.isHealthy()
    if (isHealthy) {
        // Ready to process payments
    }
}
```

## Architecture Patterns

### Repository Pattern

```kotlin
// data/repository/PaymentRepository.kt
class PaymentRepository(
    private val facilitator: FacilitatorClient = FacilitatorClient.create()
) {
    suspend fun verifyPayment(
        payload: PaymentPayload,
        requirements: PaymentRequirements
    ): Result<VerifyResponse> = runCatching {
        facilitator.verify(payload, requirements)
    }

    suspend fun settlePayment(
        payload: PaymentPayload,
        requirements: PaymentRequirements
    ): Result<SettleResponse> = runCatching {
        facilitator.settle(payload, requirements)
    }

    suspend fun getSupportedNetworks(): Result<List<String>> = runCatching {
        facilitator.supported().kinds.map { it.network }
    }

    suspend fun discoverEndpoints(limit: Int = 20): Result<List<DiscoveredResource>> = runCatching {
        facilitator.listResources(limit = limit).items
    }
}
```

### Dependency Injection with Hilt

```kotlin
// di/NetworkModule.kt
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideFacilitatorConfig(): FacilitatorConfig {
        return FacilitatorConfig(
            baseUrl = BuildConfig.FACILITATOR_URL,
            timeoutMs = 30_000
        )
    }

    @Provides
    @Singleton
    fun provideFacilitatorClient(config: FacilitatorConfig): FacilitatorClient {
        return FacilitatorClient(config)
    }

    @Provides
    @Singleton
    fun providePaymentRepository(client: FacilitatorClient): PaymentRepository {
        return PaymentRepository(client)
    }
}
```

### ViewModel with StateFlow

```kotlin
// ui/payment/PaymentViewModel.kt
@HiltViewModel
class PaymentViewModel @Inject constructor(
    private val paymentRepository: PaymentRepository
) : ViewModel() {

    sealed class UiState {
        object Idle : UiState()
        object Loading : UiState()
        data class Success(val response: VerifyResponse) : UiState()
        data class Error(val message: String) : UiState()
    }

    private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun verifyPayment(payload: PaymentPayload, requirements: PaymentRequirements) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading

            paymentRepository.verifyPayment(payload, requirements)
                .onSuccess { response ->
                    _uiState.value = if (response.isValid) {
                        UiState.Success(response)
                    } else {
                        UiState.Error(response.invalidReason ?: "Verification failed")
                    }
                }
                .onFailure { error ->
                    _uiState.value = UiState.Error(error.message ?: "Unknown error")
                }
        }
    }

    fun resetState() {
        _uiState.value = UiState.Idle
    }
}
```

## Complete Example App

### Project Structure

```
app/
├── src/main/
│   ├── kotlin/com/example/x402demo/
│   │   ├── data/
│   │   │   ├── model/
│   │   │   │   └── PaymentState.kt
│   │   │   └── repository/
│   │   │       └── PaymentRepository.kt
│   │   ├── di/
│   │   │   └── AppModule.kt
│   │   ├── ui/
│   │   │   ├── components/
│   │   │   │   ├── PaymentButton.kt
│   │   │   │   └── NetworkSelector.kt
│   │   │   ├── screens/
│   │   │   │   ├── HomeScreen.kt
│   │   │   │   └── PaymentScreen.kt
│   │   │   └── viewmodel/
│   │   │       └── PaymentViewModel.kt
│   │   └── MainActivity.kt
│   └── AndroidManifest.xml
└── build.gradle.kts
```

### PaymentScreen Composable

```kotlin
// ui/screens/PaymentScreen.kt
@Composable
fun PaymentScreen(
    viewModel: PaymentViewModel = hiltViewModel(),
    onPaymentComplete: (String) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("x402 Payment") })
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Network selection
            NetworkSelector(
                selectedNetwork = viewModel.selectedNetwork,
                onNetworkSelected = viewModel::selectNetwork
            )

            // Amount display
            PaymentAmountCard(
                amount = viewModel.paymentAmount,
                asset = "USDC",
                network = viewModel.selectedNetwork
            )

            Spacer(modifier = Modifier.weight(1f))

            // Status display
            when (val state = uiState) {
                is UiState.Loading -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.CenterHorizontally)
                    )
                    Text(
                        "Verifying payment...",
                        modifier = Modifier.align(Alignment.CenterHorizontally)
                    )
                }

                is UiState.Success -> {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer
                        )
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Payment Verified!")
                            Text("Payer: ${state.response.payer}")
                        }
                    }
                    LaunchedEffect(state) {
                        delay(2000)
                        state.response.payer?.let { onPaymentComplete(it) }
                    }
                }

                is UiState.Error -> {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer
                        )
                    ) {
                        Text(
                            text = state.message,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(16.dp)
                        )
                    }
                }

                else -> {}
            }

            // Pay button
            Button(
                onClick = { viewModel.initiatePayment() },
                modifier = Modifier.fillMaxWidth(),
                enabled = uiState !is UiState.Loading
            ) {
                Text("Pay with x402")
            }
        }
    }
}
```

### Network Selector Component

```kotlin
// ui/components/NetworkSelector.kt
@Composable
fun NetworkSelector(
    selectedNetwork: String,
    onNetworkSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val networks = listOf(
        "eip155:8453" to "Base Mainnet",
        "eip155:84532" to "Base Sepolia",
        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" to "Solana Mainnet",
        "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" to "Solana Devnet"
    )

    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = networks.find { it.first == selectedNetwork }?.second ?: "Select Network"

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = modifier
    ) {
        OutlinedTextField(
            value = selectedLabel,
            onValueChange = {},
            readOnly = true,
            label = { Text("Network") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor()
                .fillMaxWidth()
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            networks.forEach { (id, label) ->
                DropdownMenuItem(
                    text = { Text(label) },
                    onClick = {
                        onNetworkSelected(id)
                        expanded = false
                    }
                )
            }
        }
    }
}
```

## Payment Flow

### 1. User initiates payment

```kotlin
// User taps "Pay" button
viewModel.initiatePayment()
```

### 2. Create payment payload

```kotlin
// This depends on your wallet integration
// Example for EVM (Base):
val payload = PaymentPayload(
    x402Version = 2,
    scheme = "exact",
    network = "eip155:8453",
    payload = mapOf(
        "signature" to JsonPrimitive(signedAuthorization),
        "authorization" to JsonObject(mapOf(
            "from" to JsonPrimitive(userAddress),
            "to" to JsonPrimitive(payToAddress),
            "value" to JsonPrimitive(amountInWei),
            "validAfter" to JsonPrimitive("0"),
            "validBefore" to JsonPrimitive(deadline),
            "nonce" to JsonPrimitive(nonce)
        ))
    )
)
```

### 3. Verify payment

```kotlin
val verifyResult = facilitator.verify(payload, requirements)
if (verifyResult.isValid) {
    // Payment signature is valid
    // Proceed with settlement or service delivery
}
```

### 4. Settle payment (optional)

```kotlin
// If you want the facilitator to execute the transfer
val settleResult = facilitator.settle(payload, requirements)
if (settleResult.success) {
    val txHash = settleResult.transaction
    // Payment complete!
}
```

## Error Handling

```kotlin
sealed class PaymentError {
    data class Network(val message: String) : PaymentError()
    data class Verification(val reason: String) : PaymentError()
    data class Settlement(val reason: String) : PaymentError()
    object Timeout : PaymentError()
    object Unknown : PaymentError()
}

suspend fun safeVerify(
    payload: PaymentPayload,
    requirements: PaymentRequirements
): Either<PaymentError, VerifyResponse> {
    return try {
        val result = facilitator.verify(payload, requirements)
        if (result.isValid) {
            Either.Right(result)
        } else {
            Either.Left(PaymentError.Verification(result.invalidReason ?: "Unknown"))
        }
    } catch (e: FacilitatorException) {
        when (e.statusCode) {
            408 -> Either.Left(PaymentError.Timeout)
            in 400..499 -> Either.Left(PaymentError.Verification(e.message ?: "Bad request"))
            in 500..599 -> Either.Left(PaymentError.Network("Server error"))
            else -> Either.Left(PaymentError.Unknown)
        }
    } catch (e: Exception) {
        Either.Left(PaymentError.Network(e.message ?: "Network error"))
    }
}
```

## Testing

### Unit Tests

```kotlin
@Test
fun `verify returns valid for correct payment`() = runTest {
    val mockClient = mockk<FacilitatorClient>()
    coEvery { mockClient.verify(any(), any()) } returns VerifyResponse(
        isValid = true,
        payer = "0x123..."
    )

    val repository = PaymentRepository(mockClient)
    val result = repository.verifyPayment(testPayload, testRequirements)

    assertTrue(result.isSuccess)
    assertTrue(result.getOrNull()?.isValid == true)
}
```

### Integration Tests

```kotlin
@Test
fun `health check returns ok`() = runTest {
    val client = FacilitatorClient.create()
    val health = client.health()

    assertEquals("ok", health.status)
}
```

## Security Considerations

### 1. Never store private keys in the app

Use secure wallet providers (WalletConnect, Coinbase Wallet SDK, etc.) for signing.

### 2. Validate server responses

```kotlin
// Always check response validity
if (result.isValid && result.payer != null) {
    // Proceed
}
```

### 3. Use HTTPS only

The SDK enforces HTTPS by default. Never override this in production.

### 4. Handle sensitive data properly

```kotlin
// Clear sensitive data after use
paymentPayload = null
System.gc()
```

### 5. Certificate pinning (optional)

For high-security apps, implement certificate pinning:

```kotlin
val config = FacilitatorConfig(
    baseUrl = "https://facilitator.x402endpoints.online",
    // Add OkHttp with certificate pinning for production
)
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `NetworkOnMainThreadException` | Wrap calls in `viewModelScope.launch { }` |
| Timeout errors | Increase `timeoutMs` in config |
| SSL errors | Check device date/time, update certificates |
| Serialization errors | Ensure ProGuard rules are added |

### Debug Logging

```kotlin
val client = FacilitatorClient(
    FacilitatorConfig(
        baseUrl = "https://facilitator.x402endpoints.online",
        headers = mapOf("X-Debug" to "true")
    )
)
```

## Resources

- [x402 Protocol Specification](https://x402.org)
- [SDK Source Code](https://github.com/Concorde89/facilitator/tree/main/sdk-kotlin)
- [API Documentation](https://github.com/Concorde89/facilitator/blob/main/docs/API.md)
- [Example Android App](https://github.com/Concorde89/facilitator/tree/main/examples/android)

## Support

- X: [@Autoincentiv3](https://x.com/Autoincentiv3)
- GitHub Issues: [github.com/Concorde89/facilitator/issues](https://github.com/Concorde89/facilitator/issues)
- Email: contact@autoincentive.online
