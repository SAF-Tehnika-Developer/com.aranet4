'use strict'

const Homey = require('homey')

const DATA_SERVICE_UUIDS = Homey.manifest.aranet4homey_data.data_service_uuid
const DATA_CHARACTERISTIC_UUID = Homey.manifest.aranet4homey_data.data_characteristic_uuid
const MAX_RETRIES = Homey.manifest.aranet4homey_data.max_retries

class Aranet4Homey extends Homey.App {
  onInit() {
    console.log('\nAranet4Homey is running................................')
  }

  async discoverDevices() {
    let devices = []
    this.discoveringDevices = true
    for (let i = 0; i < 5; i++) {
      const advertisements = await Homey.ManagerBLE.discover([], 1000)
      devices.push(advertisements)
    }
    this.discoveringDevices = false
    devices = devices
      .flat()
      .filter(
        advertisement =>
          advertisement.localName !== undefined &&
          DATA_SERVICE_UUIDS.some(uuid => advertisement.serviceUuids.includes(uuid)),
      )
      .map(function (advertisement) {
        return {
          name: advertisement.localName,
          data: {
            id: advertisement.id,
            uuid: advertisement.uuid,
            address: advertisement.uuid,
            name: advertisement.localName,
          },
        }
      })
    return [...new Map(devices.map(item => [item['name'], item])).values()]
  }

  async findDevice(device) {
    return await Homey.ManagerBLE.find(device.getData().uuid).then(function (advertisement) {
      if (typeof advertisement === 'undefined') {
        return null
      } else {
        return advertisement
      }
    })
  }

  async checkup(device) {
    let name = device.getData().name
    let timenow = new Date().getTime()
    console.log('\nAttempting to refresh ' + name)

    let disconnectPeripheral = async () => {
      console.log('disconnectPeripheral not registered yet')
    }

    if (timenow >= device.nextcheckuptime) {
      if (device.retry >= MAX_RETRIES) {
        if (device.getSettings().connection == true && device.lost_conn == false) {
          let text = Homey.__('notifications.connection.lost', {
            device: name,
          })
          let connTimeout = new Homey.Notification({ excerpt: text })
          connTimeout.register().catch(error => {
            console.log('Lost connection notification not registered:' + error)
          })
        }
        device.lost_conn = true
        device.nextcheckuptime = timenow + this.manifest.aranet4homey_data.timeout.long
        device.retry = 0
        await device.setUnavailable(
          Homey.__('notifications.app.no_connection', {
            device: name,
          }),
        )
        console.log(
          'Connection failed after ' +
            MAX_RETRIES +
            ' retries, next checkup set after ' +
            this.manifest.aranet4homey_data.timeout.long / 1000 +
            ' s',
        )
        return device
      }
      if (this.discoveringDevices) {
        console.log('Start 10s BLE module discovery checkup timeout')
        await new Promise(resolve => setTimeout(resolve, 10000))
        console.log('End BLE module discovery checkup timeout')
      }
      try {
        console.log(
          '---------Refresh sensor data for ' +
            name +
            '---------' +
            ' (attempt ' +
            (device.retry + 1) +
            '/' +
            MAX_RETRIES +
            ')',
        )

        let advertisement = await this.findDevice(device)
        if (!advertisement) {
          device.retry += 1
          console.log('Missing advertisement: ' + name)
          return device
        }

        console.log('Attemtping to connect: ' + name)
        device.peripheral = await advertisement.connect()

        disconnectPeripheral = async () => {
          try {
            console.log('Attempting to disconnect ' + name + ' peripheral')
            if (device.peripheral.isConnected) {
              return await device.peripheral.disconnect()
            }
          } catch (err) {
            console.log('Error disconnecting peripheral for ' + name + ': ' + err)
          }
        }

        let services = await device.peripheral.discoverServices()

        let service = await services.find(service => DATA_SERVICE_UUIDS.includes(service.uuid))
        if (!service) {
          device.retry = 0
          device.nextcheckuptime = timenow + this.manifest.aranet4homey_data.timeout.long
          await device.setUnavailable(
            Homey.__('notifications.app.common_error', {
              device: name,
            }),
          )
          console.log('Missing data service: ' + name)
          await disconnectPeripheral()
          return device
        }
        let characteristics = await service.discoverCharacteristics()

        console.log('Getting sensor data: ' + name)
        let data = await characteristics.find(characteristic => characteristic.uuid === DATA_CHARACTERISTIC_UUID)
        if (!data) {
          device.retry = 0
          device.nextcheckuptime = timenow + this.manifest.aranet4homey_data.timeout.long
          await device.setUnavailable(
            Homey.__('notifications.app.common_error', {
              device: name,
            }),
          )
          console.log('Missing data characteristic')
          await disconnectPeripheral()
          return device
        }
        let sensorData = await data.read()
        console.log('Sensor data: ', sensorData)

        if (!sensorData.length) {
          device.retry = 0
          device.nextcheckuptime = timenow + this.manifest.aranet4homey_data.timeout.long
          await device.setUnavailable(
            Homey.__('notifications.app.common_error', {
              device: name,
            }),
          )
          console.log('Refresh canceled for ' + name + ': Homey integration is disabled or calibration in progress')
          await disconnectPeripheral()
          return device
        }

        let sensorValues = {
          measure_co2: sensorData.readUInt16LE(0),
          measure_temperature: sensorData.readUInt16LE(2) / 20,
          measure_pressure: sensorData.readUInt16LE(4) / 10,
          measure_humidity: sensorData.readUInt8(6),
          measure_battery: sensorData.readUInt8(7),
          alarm_battery: sensorData.readUInt8(7) < this.manifest.aranet4homey_data.battery_alarm_trigger,
        }

        if (sensorValues.alarm_battery == true && device.alarm_battery_triggered == false) {
          device.alarm_battery_triggered = true
          let text = Homey.__('notifications.app.low_battery', {
            device: name,
          })
          let batteryNotification = new Homey.Notification({
            excerpt: text,
          })
          batteryNotification.register().catch(error => {
            console.log('Low battery notification not registered:' + error)
          })
        } else if (
          sensorValues.alarm_battery == false &&
          device.alarm_battery_triggered == true &&
          sensorValues.measure_battery >= this.manifest.aranet4homey_data.battery_alarm_trigger + 10
        ) {
          device.alarm_battery_triggered = false
        }

        let interval = sensorData.readUInt16LE(9)
        let passed = sensorData.readUInt16LE(11)
        if (interval > passed) {
          let remaining = 10 + interval - passed
          device.nextcheckuptime = new Date().getTime() + remaining * 1000
          console.log('Remaining time to refresh ' + name + ': ' + remaining + 's')
        }

        for (const characteristic of device.getCapabilities()) {
          if (sensorValues.hasOwnProperty(characteristic)) {
            await device.setCapabilityValue(characteristic, sensorValues[characteristic])
          }
        }
        console.log('Updated sensor data: \n', sensorValues)

        await disconnectPeripheral()
        console.log('Disconnected ' + name + ' peripheral')

        if (device.lost_conn == true) {
          device.lost_conn = false
          if (device.getSettings().connection == true) {
            let text = Homey.__('notifications.connection.secured', {
              device: name,
            })
            let connSecured = new Homey.Notification({
              excerpt: text,
            })
            connSecured.register().catch(error => {
              console.log('Restored connection notification not registered:' + error)
            })
          }
        }

        device.retry = 0
        await device.setAvailable()
        console.log('Refresh completed for: ' + name)

        return device
      } catch (err) {
        device.retry += 1
        await disconnectPeripheral()
        console.log('Refresh error: ' + err)
        console.log('Start 10s BLE module error recovery timeout')
        await new Promise(resolve => setTimeout(resolve, 10000))
        console.log('End BLE module error recovery timeout')
        return device
      }
    } else {
      console.log('---Refresh sensor data for ' + name + ' (postphoned)--')
      console.log('Remaining time to next refresh ' + name + ': ' + ~~((device.nextcheckuptime - timenow) / 1000) + 's')
      return device
    }
  }

  async updateDevice(device) {
    return await this.checkup(device)
  }

  async updateDevices(devices) {
    return await devices.reduce((promise, device) => {
      return promise
        .then(() => {
          return this.updateDevice(device)
        })
        .catch(error => {
          console.log(error)
        })
    }, Promise.resolve())
  }
}

module.exports = Aranet4Homey
