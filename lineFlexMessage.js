const generateFlexMessage = (altText, uri) => {
    const uriAction = {
        type: 'uri',
        label: 'Google Calendar',
        uri: uri
    }

    const flexButton = {
        type: 'button',
        action: uriAction,
        style: 'link',
        height: 'sm'
    }

    const flexBox = {
        type: 'box',
        layout: 'horizontal',
        flex: 0,
        contents: [flexButton]
    }

    const flexBubble = {
        type: 'bubble',
        footer: flexBox
    }

    return {
        type: 'flex',
        altText: altText,
        contents: flexBubble,
    };
}

export default generateFlexMessage;