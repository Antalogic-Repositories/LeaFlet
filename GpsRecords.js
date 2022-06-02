import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import PropTypes from 'prop-types'

import { DateTime } from 'luxon'
import ms from 'ms'

import filter from 'lodash/filter'
import includes from 'lodash/includes'
import isEmpty from 'lodash/isEmpty'
import map from 'lodash/map'
import orderBy from 'lodash/orderBy'

import { dangerousIcon } from 'Components/Blocks/Customer/Forms/Client/MapIcons'
import Legend from 'Components/Blocks/Customer/Forms/Client/MapLegend'
import MapLocationInfo from 'Components/Blocks/Customer/Forms/Client/MapLocationInfo'
import {
  MapLegend,
  MapWrapper,
} from 'Components/Blocks/Customer/Forms/Client/styles'
import TrackingLog from 'Components/Blocks/Customer/Forms/Client/TrackingLog'
import { Column, Element, Loader, Row } from 'Components/UI'

import eventsQuery from 'GraphQL/Queries/Events/eventsCustomer.graphql'
import gpsRecordsQuery from 'GraphQL/Queries/GPS/userGpsRecords.graphql'
import restrictionsQuery from 'GraphQL/Queries/Locations/locationRestrictions.graphql'

import { useMapMarkerIcon, useTrackingData } from 'Hooks'

import { useAdminLazyQuery } from 'Services/Apollo'

import { theme } from 'Theme'

function MapTracker({ bounds }) {
  const leaflet = useMap()

  useEffect(() => {
    if (bounds) {
      leaflet.fitBounds(bounds)
    }
  }, [leaflet, bounds])

  return null
}

/**
 * @see @{link https://react-leaflet.js.org/}
 */
function GpsRecords({ range, user, onChangeDateRange, timeInterval }) {
  const [bounds, setBounds] = useState()
  const viewportRef = useRef()
  const [selectedMarker, setSelectedMarker] = useState(null)
  const [filters, setFilters] = useState([])

  const [loadEvents, { data: dataEvents, loading: eventsLoading }] =
    useAdminLazyQuery(eventsQuery, {
      variables: {
        userId: user?.id,

        createdAtFrom: DateTime.fromJSDate(range?.from)
          .toUTC()
          .startOf('day')
          .toISO(),

        createdAtTo: DateTime.fromJSDate(range?.to)
          .toUTC()
          .endOf('day')
          .toISO(),
      },
    })

  const [loadGpsData, { data: gpsData, loading: gpsLoading }] =
    useAdminLazyQuery(gpsRecordsQuery, {
      variables: {
        userId: user?.id,

        createdAtFrom: DateTime.fromJSDate(range?.from)
          .toUTC()
          .startOf('day')
          .toISO(),

        createdAtTo: DateTime.fromJSDate(range?.to)
          .toUTC()
          .endOf('day')
          .toISO(),
      },
      pollInterval: ms('10m'),
    })

  const [
    loadRestrictedData,
    { data: restrictedData, loading: restrictedLoading },
  ] = useAdminLazyQuery(restrictionsQuery, {
    variables: {
      userId: user?.id,
    },
  })

  useEffect(() => {
    if (user) {
      loadGpsData()
      loadRestrictedData()
      loadEvents()
    }
  }, [loadGpsData, loadRestrictedData, loadEvents, user])

  const restrictions = useMemo(
    () => restrictedData?.userRestrictedLocations?.rows,
    [restrictedData],
  )

  const events = useMemo(() => {
    if (filters.length) {
      return dataEvents?.events?.rows.filter(event =>
        filters.some(category => category === event.kind),
      )
    }
    return dataEvents?.events?.rows
  }, [dataEvents, filters])

  const records = useMemo(() => gpsData?.gpsRecords?.rows || [], [gpsData])
  const gpsRecordsWithWarnings = useTrackingData(records, events)

  const sortedGpsRecordsWithWarnings = useMemo(() => {
    const orderedRecords = orderBy(
      gpsRecordsWithWarnings,
      ['gatheredAt'],
      ['asc'],
    )
    return filters.length > 0
      ? orderedRecords.filter(record => record.warnings)
      : orderedRecords
  }, [gpsRecordsWithWarnings, filters])

  const recordsIdPath = useMemo(
    () =>
      map(
        sortedGpsRecordsWithWarnings,
        ({ id, latitude, longitude, warnings }) => ({
          id,
          latLng: [latitude, longitude],
          warnings,
        }),
      ),
    [sortedGpsRecordsWithWarnings],
  )

  const recordsPath = useMemo(
    () => map(recordsIdPath, ({ latLng }) => [latLng[0], latLng[1]]),
    [recordsIdPath],
  )
  useEffect(() => {
    const timeout = setTimeout(() => {
      setBounds(recordsPath.length > 1 && viewportRef?.current?.getBounds())
    }, 100)

    return () => {
      clearTimeout(timeout)
    }
  }, [recordsPath])

  const renderTooltip = useCallback(
    locationIndex => {
      const filteredRecords = filter(recordsIdPath, (e, i) => i % 5 === 4)
      if (
        locationIndex === recordsIdPath?.length - 1 ||
        locationIndex === 0 ||
        includes(filteredRecords, recordsIdPath[locationIndex])
      ) {
        return locationIndex + 1
      }
      return null
    },
    [recordsIdPath],
  )

  const [getMarkerIcon] = useMapMarkerIcon(selectedMarker)

  if (gpsLoading || restrictedLoading) {
    return (
      <Row center height={364} justifyCenter width={1}>
        <Loader />
      </Row>
    )
  }

  const handleChangeFilters = e => {
    if (e.target.checked) {
      setFilters([...filters, e.target.value])
    } else {
      setFilters(filters.filter(id => id !== e.target.value))
    }
  }
  return (
    <Row spaceBetween width={1}>
      <Element borderFull radius={2} whiteBackground width={0.42}>
        <TrackingLog
          dataToRender={sortedGpsRecordsWithWarnings}
          filters={filters}
          loading={eventsLoading}
          range={range}
          selected={selectedMarker}
          setBounds={setBounds}
          setSelected={setSelectedMarker}
          timeInterval={timeInterval}
          onChangeDateRange={onChangeDateRange}
          onChangeFilters={handleChangeFilters}
        />
      </Element>
      <Element borderFull radius={2} whiteBackground width={0.57}>
        <Column>
          <MapWrapper dangerColor="#e73f3f">
            <MapContainer
              center={[40, -80]}
              style={{ height: 445, borderRadius: 2 }}
              zoom={5}
              zoomControl={false}
            >
              <TileLayer
                attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {map(
                restrictions,
                ({
                  id,
                  name,
                  address,
                  latitude,
                  longitude,
                  locationRestrictions,
                }) => (
                  <Marker
                    icon={dangerousIcon}
                    key={id}
                    position={[latitude, longitude]}
                  >
                    <Popup>
                      <MapLocationInfo
                        address={address}
                        latitude={latitude}
                        locationRestrictionName={locationRestrictions[0]?.name}
                        longitude={longitude}
                        name={name}
                      />
                    </Popup>
                  </Marker>
                ),
              )}

              {!isEmpty(recordsPath) && (
                <>
                  {recordsPath.length === 1 ? (
                    <Marker
                      icon={getMarkerIcon(recordsIdPath[0])}
                      position={recordsPath}
                      ref={viewportRef}
                    />
                  ) : (
                    <>
                      <Polyline
                        pathOptions={{
                          color: theme.colors.primary,
                          weight: 1,
                        }}
                        positions={recordsPath}
                        ref={viewportRef}
                      />
                      {map(recordsIdPath, (record, id) => (
                        <Marker
                          eventHandlers={{
                            click: () => setSelectedMarker(record?.id),
                          }}
                          icon={getMarkerIcon(record)}
                          key={record?.id}
                          position={record?.latLng}
                        >
                          <Tooltip direction="top" permanent>
                            {renderTooltip(id)}
                          </Tooltip>
                        </Marker>
                      ))}
                    </>
                  )}
                </>
              )}

              <MapTracker bounds={bounds} />
            </MapContainer>
            <MapLegend>
              <Legend />
            </MapLegend>
          </MapWrapper>
        </Column>
      </Element>
    </Row>
  )
}

GpsRecords.propTypes = {
  range: PropTypes.object.isRequired,
  timeInterval: PropTypes.string,
  user: PropTypes.object.isRequired,
  onChangeDateRange: PropTypes.func,
}

GpsRecords.defaultProps = {
  timeInterval: '',
  onChangeDateRange: undefined,
}

export default GpsRecords
