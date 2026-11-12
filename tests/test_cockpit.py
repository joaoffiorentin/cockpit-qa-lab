import unittest

from cockpit import Cockpit


class CockpitTests(unittest.TestCase):
    def setUp(self):
        self.cockpit = Cockpit()

    def test_playback_recovers_after_reconnection(self):
        self.cockpit.dispatch("play")
        disconnected = self.cockpit.dispatch("phone_disconnect")
        self.assertFalse(disconnected["media_playing"])
        self.assertTrue(disconnected["media_interrupted"])
        recovered = self.cockpit.dispatch("phone_connect")
        self.assertTrue(recovered["media_playing"])
        self.assertEqual(recovered["projection"], "Android Auto")

    def test_injected_fault_is_observable(self):
        self.cockpit.dispatch("fault_toggle")
        self.cockpit.dispatch("play")
        self.cockpit.dispatch("phone_disconnect")
        state = self.cockpit.dispatch("phone_connect")
        self.assertFalse(state["media_playing"])
        self.assertTrue(state["media_interrupted"])
        self.assertIn("failed to recover", state["events"][1]["message"])

    def test_usb_retains_connection_when_bluetooth_is_disabled(self):
        self.cockpit.dispatch("usb_toggle")
        connected = self.cockpit.dispatch("bluetooth_toggle")
        self.assertTrue(connected["phone_connected"])
        disconnected = self.cockpit.dispatch("usb_toggle")
        self.assertFalse(disconnected["phone_connected"])

    def test_vehicle_signals_and_invalid_speed(self):
        self.assertEqual(self.cockpit.dispatch("reverse_toggle")["gear"], "R")
        self.assertEqual(self.cockpit.dispatch("door_toggle")["door_open"], True)
        self.assertEqual(self.cockpit.dispatch("speed_set", 80)["speed_kmh"], 80)
        with self.assertRaises(ValueError):
            self.cockpit.dispatch("speed_set", 250)


if __name__ == "__main__":
    unittest.main()
