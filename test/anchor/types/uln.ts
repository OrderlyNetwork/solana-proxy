export type Uln = {
    version: '0.1.0'
    name: 'uln'
    instructions: [
        {
            name: 'initUln'
            accounts: [
                {
                    name: 'payer'
                    isMut: true
                    isSigner: true
                },
                {
                    name: 'uln'
                    isMut: true
                    isSigner: false
                },
                {
                    name: 'systemProgram'
                    isMut: false
                    isSigner: false
                },
            ]
            args: [
                {
                    name: 'params'
                    type: {
                        defined: 'InitUlnParams'
                    }
                },
            ]
        },
        {
            name: 'commitVerification'
            accounts: [
                {
                    name: 'uln'
                    isMut: false
                    isSigner: false
                },
            ]
            args: [
                {
                    name: 'params'
                    type: {
                        defined: 'CommitVerificationParams'
                    }
                },
            ]
        },
        {
            name: 'send'
            accounts: [
                {
                    name: 'endpoint'
                    isMut: false
                    isSigner: true
                },
            ]
            args: [
                {
                    name: 'params'
                    type: {
                        defined: 'SendParams'
                    }
                },
            ]
            returns: {
                defined: '(MessagingFee,Vec<u8>)'
            }
        },
        {
            name: 'quote'
            accounts: [
                {
                    name: 'endpoint'
                    isMut: false
                    isSigner: true
                },
            ]
            args: [
                {
                    name: 'params'
                    type: {
                        defined: 'QuoteParams'
                    }
                },
            ]
            returns: {
                defined: 'MessagingFee'
            }
        },
    ]
    accounts: [
        {
            name: 'ulnSettings'
            type: {
                kind: 'struct'
                fields: [
                    {
                        name: 'eid'
                        type: 'u32'
                    },
                    {
                        name: 'endpoint'
                        type: 'publicKey'
                    },
                    {
                        name: 'endpointProgram'
                        type: 'publicKey'
                    },
                    {
                        name: 'bump'
                        type: 'u8'
                    },
                    {
                        name: 'admin'
                        type: 'publicKey'
                    },
                ]
            }
        },
    ]
    types: [
        {
            name: 'CommitVerificationParams'
            type: {
                kind: 'struct'
                fields: [
                    {
                        name: 'nonce'
                        type: 'u64'
                    },
                    {
                        name: 'srcEid'
                        type: 'u32'
                    },
                    {
                        name: 'sender'
                        type: 'publicKey'
                    },
                    {
                        name: 'dstEid'
                        type: 'u32'
                    },
                    {
                        name: 'receiver'
                        type: {
                            array: ['u8', 32]
                        }
                    },
                    {
                        name: 'guid'
                        type: {
                            array: ['u8', 32]
                        }
                    },
                    {
                        name: 'message'
                        type: 'bytes'
                    },
                ]
            }
        },
        {
            name: 'InitUlnParams'
            type: {
                kind: 'struct'
                fields: [
                    {
                        name: 'eid'
                        type: 'u32'
                    },
                    {
                        name: 'endpoint'
                        type: 'publicKey'
                    },
                    {
                        name: 'endpointProgram'
                        type: 'publicKey'
                    },
                    {
                        name: 'admin'
                        type: 'publicKey'
                    },
                ]
            }
        },
        {
            name: 'MessagingFee'
            type: {
                kind: 'struct'
                fields: [
                    {
                        name: 'nativeFee'
                        type: 'u64'
                    },
                    {
                        name: 'lzTokenFee'
                        type: 'u64'
                    },
                ]
            }
        },
        {
            name: 'QuoteParams'
            type: {
                kind: 'struct'
                fields: [
                    {
                        name: 'packet'
                        type: {
                            defined: 'Packet'
                        }
                    },
                    {
                        name: 'options'
                        type: 'bytes'
                    },
                    {
                        name: 'payInLzToken'
                        type: 'bool'
                    },
                ]
            }
        },
        {
            name: 'Packet'
            type: {
                kind: 'struct'
                fields: [
                    {
                        name: 'nonce'
                        type: 'u64'
                    },
                    {
                        name: 'srcEid'
                        type: 'u32'
                    },
                    {
                        name: 'sender'
                        type: 'publicKey'
                    },
                    {
                        name: 'dstEid'
                        type: 'u32'
                    },
                    {
                        name: 'receiver'
                        type: {
                            array: ['u8', 32]
                        }
                    },
                    {
                        name: 'guid'
                        type: {
                            array: ['u8', 32]
                        }
                    },
                    {
                        name: 'message'
                        type: 'bytes'
                    },
                ]
            }
        },
        {
            name: 'SendParams'
            type: {
                kind: 'struct'
                fields: [
                    {
                        name: 'packet'
                        type: {
                            defined: 'Packet'
                        }
                    },
                    {
                        name: 'options'
                        type: 'bytes'
                    },
                    {
                        name: 'nativeFee'
                        type: 'u64'
                    },
                ]
            }
        },
    ]
}

export const IDL: Uln = {
    version: '0.1.0',
    name: 'uln',
    instructions: [
        {
            name: 'initUln',
            accounts: [
                {
                    name: 'payer',
                    isMut: true,
                    isSigner: true,
                },
                {
                    name: 'uln',
                    isMut: true,
                    isSigner: false,
                },
                {
                    name: 'systemProgram',
                    isMut: false,
                    isSigner: false,
                },
            ],
            args: [
                {
                    name: 'params',
                    type: {
                        defined: 'InitUlnParams',
                    },
                },
            ],
        },
        {
            name: 'commitVerification',
            accounts: [
                {
                    name: 'uln',
                    isMut: false,
                    isSigner: false,
                },
            ],
            args: [
                {
                    name: 'params',
                    type: {
                        defined: 'CommitVerificationParams',
                    },
                },
            ],
        },
        {
            name: 'send',
            accounts: [
                {
                    name: 'endpoint',
                    isMut: false,
                    isSigner: true,
                },
            ],
            args: [
                {
                    name: 'params',
                    type: {
                        defined: 'SendParams',
                    },
                },
            ],
            returns: {
                defined: '(MessagingFee,Vec<u8>)',
            },
        },
        {
            name: 'quote',
            accounts: [
                {
                    name: 'endpoint',
                    isMut: false,
                    isSigner: true,
                },
            ],
            args: [
                {
                    name: 'params',
                    type: {
                        defined: 'QuoteParams',
                    },
                },
            ],
            returns: {
                defined: 'MessagingFee',
            },
        },
    ],
    accounts: [
        {
            name: 'ulnSettings',
            type: {
                kind: 'struct',
                fields: [
                    {
                        name: 'eid',
                        type: 'u32',
                    },
                    {
                        name: 'endpoint',
                        type: 'publicKey',
                    },
                    {
                        name: 'endpointProgram',
                        type: 'publicKey',
                    },
                    {
                        name: 'bump',
                        type: 'u8',
                    },
                    {
                        name: 'admin',
                        type: 'publicKey',
                    },
                ],
            },
        },
    ],
    types: [
        {
            name: 'CommitVerificationParams',
            type: {
                kind: 'struct',
                fields: [
                    {
                        name: 'nonce',
                        type: 'u64',
                    },
                    {
                        name: 'srcEid',
                        type: 'u32',
                    },
                    {
                        name: 'sender',
                        type: 'publicKey',
                    },
                    {
                        name: 'dstEid',
                        type: 'u32',
                    },
                    {
                        name: 'receiver',
                        type: {
                            array: ['u8', 32],
                        },
                    },
                    {
                        name: 'guid',
                        type: {
                            array: ['u8', 32],
                        },
                    },
                    {
                        name: 'message',
                        type: 'bytes',
                    },
                ],
            },
        },
        {
            name: 'InitUlnParams',
            type: {
                kind: 'struct',
                fields: [
                    {
                        name: 'eid',
                        type: 'u32',
                    },
                    {
                        name: 'endpoint',
                        type: 'publicKey',
                    },
                    {
                        name: 'endpointProgram',
                        type: 'publicKey',
                    },
                    {
                        name: 'admin',
                        type: 'publicKey',
                    },
                ],
            },
        },
        {
            name: 'MessagingFee',
            type: {
                kind: 'struct',
                fields: [
                    {
                        name: 'nativeFee',
                        type: 'u64',
                    },
                    {
                        name: 'lzTokenFee',
                        type: 'u64',
                    },
                ],
            },
        },
        {
            name: 'QuoteParams',
            type: {
                kind: 'struct',
                fields: [
                    {
                        name: 'packet',
                        type: {
                            defined: 'Packet',
                        },
                    },
                    {
                        name: 'options',
                        type: 'bytes',
                    },
                    {
                        name: 'payInLzToken',
                        type: 'bool',
                    },
                ],
            },
        },
        {
            name: 'Packet',
            type: {
                kind: 'struct',
                fields: [
                    {
                        name: 'nonce',
                        type: 'u64',
                    },
                    {
                        name: 'srcEid',
                        type: 'u32',
                    },
                    {
                        name: 'sender',
                        type: 'publicKey',
                    },
                    {
                        name: 'dstEid',
                        type: 'u32',
                    },
                    {
                        name: 'receiver',
                        type: {
                            array: ['u8', 32],
                        },
                    },
                    {
                        name: 'guid',
                        type: {
                            array: ['u8', 32],
                        },
                    },
                    {
                        name: 'message',
                        type: 'bytes',
                    },
                ],
            },
        },
        {
            name: 'SendParams',
            type: {
                kind: 'struct',
                fields: [
                    {
                        name: 'packet',
                        type: {
                            defined: 'Packet',
                        },
                    },
                    {
                        name: 'options',
                        type: 'bytes',
                    },
                    {
                        name: 'nativeFee',
                        type: 'u64',
                    },
                ],
            },
        },
    ],
}
