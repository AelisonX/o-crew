/*
  --------------------------------
  Ø-CREW CAPABILITIES (bus v0.1)
  --------------------------------

  memory ≠ permission
  knowledge ≠ authority
  collaboration ≠ permission union
  message ≠ authority transfer

  Static, frozen, default-deny.
  Authority is always can(actor, capability):
  the sender never contributes authority.
*/

const CREW_IDS = Object.freeze([
  "doggo",
  "kitto",
  "piggo",
  "beeo",
  "farto"
]);

const CAPABILITIES = Object.freeze({
  doggo: Object.freeze([
    "show_own_bubble"
  ]),

  kitto: Object.freeze([]),
  piggo: Object.freeze([]),
  beeo: Object.freeze([]),
  farto: Object.freeze([])
});

// Capability is always derived from the intent, never from the sender.
// Nobody holds move_other: MOVE_BEEO exists only to demonstrate denial.
const INTENT_MAP = Object.freeze({
  PET_INTERACTED:
    Object.freeze({
      type: "EVENT",
      capability: null,
      payload: Object.freeze({})
    }),

  SHOW_OWN_BUBBLE:
    Object.freeze({
      type: "REQUEST",
      capability: "show_own_bubble",
      payload: Object.freeze({
        messageKey:
          Object.freeze([
            "USER_SAID_HI"
          ])
      })
    }),

  MOVE_BEEO:
    Object.freeze({
      type: "REQUEST",
      capability: "move_other",
      payload: Object.freeze({})
    })
});

// Sender never chooses subscribers.
const SUBSCRIPTIONS = Object.freeze({
  PET_INTERACTED:
    Object.freeze({
      kitto:
        Object.freeze([
          "doggo"
        ])
    })
});

// Pure, I/O-free, default-deny. Depends only on the acting pet.
function can(actor, capability) {
  return (
    typeof actor === "string" &&
    typeof capability === "string" &&
    Object.hasOwn(CAPABILITIES, actor) &&
    CAPABILITIES[actor].includes(capability)
  );
}

module.exports = {
  CREW_IDS,
  CAPABILITIES,
  INTENT_MAP,
  SUBSCRIPTIONS,
  can
};
