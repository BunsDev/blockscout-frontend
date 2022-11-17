import { useToken, useColorModeValue } from '@chakra-ui/react';
import * as d3 from 'd3';
import React from 'react';

import type { TimeChartItem, TimeChartData } from 'ui/shared/chart/types';

import computeTooltipPosition from 'ui/shared/chart/utils/computeTooltipPosition';
import type { Pointer } from 'ui/shared/chart/utils/pointerTracker';
import { trackPointer } from 'ui/shared/chart/utils/pointerTracker';

interface Props {
  width?: number;
  height?: number;
  data: TimeChartData;
  xScale: d3.ScaleTime<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  anchorEl: SVGRectElement | null;
}

const TEXT_LINE_HEIGHT = 12;
const PADDING = 16;
const LINE_SPACE = 10;
const POINT_SIZE = 16;

const ChartTooltip = ({ xScale, yScale, width, height, data, anchorEl, ...props }: Props) => {
  const lineColor = useToken('colors', 'gray.400');
  const titleColor = useToken('colors', 'blue.100');
  const textColor = useToken('colors', 'white');
  const markerBgColor = useToken('colors', useColorModeValue('black', 'white'));
  const markerBorderColor = useToken('colors', useColorModeValue('white', 'black'));
  const bgColor = useToken('colors', 'blackAlpha.900');

  const ref = React.useRef(null);

  const drawLine = React.useCallback(
    (x: number) => {
      d3.select(ref.current)
        .select('.ChartTooltip__line')
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', 0)
        .attr('y2', height || 0);
    },
    [ ref, height ],
  );

  const drawContent = React.useCallback(
    (x: number, y: number) => {
      const tooltipContent = d3.select(ref.current).select('.ChartTooltip__content');

      tooltipContent.attr('transform', (cur, i, nodes) => {
        const node = nodes[i] as SVGGElement | null;
        const { width: nodeWidth, height: nodeHeight } = node?.getBoundingClientRect() || { width: 0, height: 0 };
        const [ translateX, translateY ] = computeTooltipPosition({
          canvasWidth: width || 0,
          canvasHeight: height || 0,
          nodeWidth,
          nodeHeight,
          pointX: x,
          pointY: y,
          offset: POINT_SIZE,
        });
        return `translate(${ translateX }, ${ translateY })`;
      });

      tooltipContent
        .select('.ChartTooltip__contentDate')
        .text(d3.timeFormat('%e %b %Y')(xScale.invert(x)));
    },
    [ xScale, width, height ],
  );

  const updateDisplayedValue = React.useCallback((d: TimeChartItem, i: number) => {
    d3.selectAll('.ChartTooltip__value')
      .filter((td, tIndex) => tIndex === i)
      .text(data[i].valueFormatter?.(d.value) || d.value.toLocaleString());
  }, [ data ]);

  const drawPoints = React.useCallback((x: number) => {
    const xDate = xScale.invert(x);
    const bisectDate = d3.bisector<TimeChartItem, unknown>((d) => d.date).left;
    let baseXPos = 0;
    let baseYPos = 0;

    d3.select(ref.current)
      .selectAll('.ChartTooltip__point')
      .attr('transform', (cur, i) => {
        const index = bisectDate(data[i].items, xDate, 1);
        const d0 = data[i].items[index - 1];
        const d1 = data[i].items[index];
        const d = xDate.getTime() - d0?.date.getTime() > d1?.date.getTime() - xDate.getTime() ? d1 : d0;

        if (d.date === undefined && d.value === undefined) {
          // move point out of container
          return 'translate(-100,-100)';
        }

        const xPos = xScale(d.date);
        const yPos = yScale(d.value);

        if (i === 0) {
          baseXPos = xPos;
          baseYPos = yPos;
        }

        updateDisplayedValue(d, i);

        return `translate(${ xPos }, ${ yPos })`;
      });

    return [ baseXPos, baseYPos ];
  }, [ data, updateDisplayedValue, xScale, yScale ]);

  const draw = React.useCallback((pointer: Pointer) => {
    if (pointer.point) {
      const [ baseXPos, baseYPos ] = drawPoints(pointer.point[0]);
      drawLine(baseXPos);
      drawContent(baseXPos, baseYPos);
    }
  }, [ drawPoints, drawLine, drawContent ]);

  const showContent = React.useCallback(() => {
    d3.select(ref.current).attr('opacity', 1);
    d3.select(ref.current)
      .selectAll('.ChartTooltip__point')
      .attr('opacity', 1);
  }, []);

  const hideContent = React.useCallback(() => {
    d3.select(ref.current).attr('opacity', 0);
  }, []);

  const createPointerTracker = React.useCallback((event: PointerEvent, isSubsequentCall?: boolean) => {
    let isShown = false;
    let isPressed = event.pointerType === 'mouse' && event.type === 'pointerdown' && !isSubsequentCall;

    if (isPressed) {
      hideContent();
    }

    trackPointer(event, {
      move: (pointer) => {
        if (!pointer.point || isPressed) {
          return;
        }

        draw(pointer);
        if (!isShown) {
          showContent();
          isShown = true;
        }
      },
      out: () => {
        hideContent();
        isShown = false;
      },
      end: (tracker) => {
        hideContent();
        const isOutside = tracker.sourceEvent?.offsetX && width && (tracker.sourceEvent.offsetX > width || tracker.sourceEvent.offsetX < 0);

        if (!isOutside && isPressed) {
          window.setTimeout(() => {
            createPointerTracker(event, true);
          }, 0);
        }

        isShown = false;
        isPressed = false;
      },
    });
  }, [ draw, hideContent, showContent, width ]);

  React.useEffect(() => {
    const anchorD3 = d3.select(anchorEl);

    anchorD3
      .on('touchmove.tooltip', (event: PointerEvent) => event.preventDefault()) // prevent scrolling
      .on('pointerenter.tooltip pointerdown.tooltip', (event: PointerEvent) => {
        createPointerTracker(event);
      });

    return () => {
      anchorD3.on('touchmove.tooltip pointerenter.tooltip pointerdown.tooltip', null);
    };
  }, [ anchorEl, createPointerTracker, draw, hideContent, showContent ]);

  return (
    <g ref={ ref } opacity={ 0 } { ...props }>
      <line className="ChartTooltip__line" stroke={ lineColor } strokeDasharray="3"/>
      { data.map(({ name }) => (
        <circle
          key={ name }
          className="ChartTooltip__point"
          r={ POINT_SIZE / 2 }
          opacity={ 0 }
          fill={ markerBgColor }
          stroke={ markerBorderColor }
          strokeWidth={ 4 }
        />
      )) }
      <g className="ChartTooltip__content">
        <rect
          className="ChartTooltip__contentBg"
          rx={ 12 }
          ry={ 12 }
          fill={ bgColor }
          width={ 200 }
          height={ 2 * PADDING + (data.length + 1) * TEXT_LINE_HEIGHT + data.length * LINE_SPACE }
        />
        <g transform={ `translate(${ PADDING },${ PADDING })` }>
          <text
            className="ChartTooltip__contentTitle"
            transform="translate(0,0)"
            fontSize="12px"
            fontWeight="500"
            fill={ titleColor }
            dominantBaseline="hanging"
          >
            Date
          </text>
          <text
            className="ChartTooltip__contentDate"
            transform="translate(80,0)"
            fontSize="12px"
            fontWeight="500"
            fill={ textColor }
            dominantBaseline="hanging"
          />
        </g>
        { data.map(({ name }, index) => (
          <g
            key={ name }
            transform={ `translate(${ PADDING },${ PADDING + (index + 1) * (LINE_SPACE + TEXT_LINE_HEIGHT) })` }
          >
            <text
              className="ChartTooltip__contentTitle"
              transform="translate(0,0)"
              fontSize="12px"
              fontWeight="500"
              fill={ titleColor }
              dominantBaseline="hanging"
            >
              { name }
            </text>
            <text
              transform="translate(80,0)"
              className="ChartTooltip__value"
              fontSize="12px"
              fill={ textColor }
              dominantBaseline="hanging"
            />
          </g>
        )) }
      </g>
    </g>
  );
};

export default React.memo(ChartTooltip);